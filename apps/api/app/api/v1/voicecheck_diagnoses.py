"""VoiceCheck IA — registro de diagnósticos salvos (reabrir, renomear, excluir).

O navegador continua guardando uma cópia local (IndexedDB); este registro deixa
os diagnósticos disponíveis em qualquer computador logado na mesma conta.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import UTC, datetime
from pathlib import PurePosixPath
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import defer

from app.api.v1.voicecheck import _read_limited
from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.models import VoiceCheckDiagnosis
from app.schemas.voicecheck import (
    VoiceCheckDiagnosisListItem,
    VoiceCheckDiagnosisListResponse,
    VoiceCheckDiagnosisOut,
    VoiceCheckDiagnosisUpsert,
)
from app.services.quotas import QuotaExceeded, assert_can_upload
from app.services.storage import get_storage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voicecheck/diagnoses", tags=["voicecheck"])
settings = get_settings()

FileKind = Literal["original", "prepared", "corrected"]

#: Relatório JSON (inclui a curva de afinação) — teto para não lotar o banco.
MAX_REPORT_BYTES = 25 * 1024 * 1024
ORIGINAL_EXTS = {"mp3", "wav", "flac", "m4a", "ogg", "aac", "mp4", "mov", "webm", "mkv"}
_SAFE_MIME = re.compile(r"^[a-z]+/[a-z0-9.+-]+$")


def _parse_id(diagnosis_id: str) -> str:
    try:
        return str(uuid.UUID(diagnosis_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnóstico não encontrado") from exc


def _get_owned(db: DbSession, diagnosis_id: str, user: CurrentUser, *, with_report: bool = False) -> VoiceCheckDiagnosis:
    stmt = select(VoiceCheckDiagnosis).where(
        VoiceCheckDiagnosis.id == _parse_id(diagnosis_id),
        VoiceCheckDiagnosis.owner_id == user.id,
    )
    if not with_report:
        stmt = stmt.options(defer(VoiceCheckDiagnosis.report))
    row = db.scalar(stmt)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnóstico não encontrado")
    return row


def _aware(dt: datetime) -> datetime:
    """O MySQL devolve datas sem fuso; elas são gravadas em UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _list_item(row: VoiceCheckDiagnosis, *, has_report: bool) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "step": row.step,
        "max_reached": row.max_reached,
        "asset": row.asset_meta,
        "summary": row.summary,
        "analysis_source": row.analysis_source,
        "has_original": bool(row.original_key),
        "has_prepared": bool(row.prepared_key),
        "has_report": has_report,
        "has_corrected": bool(row.corrected_key),
        "autotune": row.autotune,
        "created_at": _aware(row.created_at),
        "updated_at": _aware(row.updated_at),
    }


def _storage_key(user_id: str, diagnosis_id: str, kind: FileKind, ext: str) -> str:
    # Fora de voicecheck/<user>/ (pasta de jobs temporários, que expiram).
    return f"voicecheck_saved/{user_id}/{diagnosis_id}/{kind}.{ext}"


@router.get("", response_model=VoiceCheckDiagnosisListResponse)
def list_diagnoses(user: CurrentUser, db: DbSession) -> VoiceCheckDiagnosisListResponse:
    rows = db.scalars(
        select(VoiceCheckDiagnosis)
        .where(VoiceCheckDiagnosis.owner_id == user.id)
        .options(defer(VoiceCheckDiagnosis.report), defer(VoiceCheckDiagnosis.probe))
        .order_by(VoiceCheckDiagnosis.updated_at.desc())
        .limit(500)
    ).all()
    # "Tem relatório" sem carregar o JSON inteiro: o resumo só existe quando há análise.
    return VoiceCheckDiagnosisListResponse(
        items=[
            VoiceCheckDiagnosisListItem.model_validate(_list_item(r, has_report=r.summary is not None))
            for r in rows
        ]
    )


@router.get("/{diagnosis_id}", response_model=VoiceCheckDiagnosisOut)
def get_diagnosis(diagnosis_id: str, user: CurrentUser, db: DbSession) -> VoiceCheckDiagnosisOut:
    row = _get_owned(db, diagnosis_id, user, with_report=True)
    data = _list_item(row, has_report=row.report is not None)
    data["probe"] = row.probe
    data["report"] = row.report
    data["voice_mix"] = row.voice_mix
    return VoiceCheckDiagnosisOut.model_validate(data)


@router.put(
    "/{diagnosis_id}",
    response_model=VoiceCheckDiagnosisListItem,
    dependencies=[Depends(verify_csrf)],
)
def upsert_diagnosis(
    diagnosis_id: str,
    payload: VoiceCheckDiagnosisUpsert,
    request: Request,
    user: CurrentUser,
    db: DbSession,
) -> VoiceCheckDiagnosisListItem:
    """Cria ou atualiza. Só os campos enviados mudam (o relatório é opcional)."""
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_REPORT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Relatório grande demais")

    did = _parse_id(diagnosis_id)
    row = db.scalar(select(VoiceCheckDiagnosis).where(VoiceCheckDiagnosis.id == did))
    if row is not None and row.owner_id != user.id:
        # Mesmo id de outra conta: não revela que existe.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Diagnóstico não encontrado")

    sent = payload.model_fields_set
    if row is None:
        row = VoiceCheckDiagnosis(id=did, owner_id=user.id, title=payload.title.strip())
        created = payload.created_at
        if created is not None:
            now = datetime.now(UTC)
            created_utc = created if created.tzinfo else created.replace(tzinfo=UTC)
            row.created_at = min(created_utc, now)
        db.add(row)

    row.title = payload.title.strip()
    if "step" in sent:
        row.step = payload.step
    if "max_reached" in sent:
        row.max_reached = payload.max_reached
    if "asset" in sent:
        row.asset_meta = payload.asset.model_dump() if payload.asset else None
    if "probe" in sent:
        row.probe = payload.probe
    if "summary" in sent:
        row.summary = payload.summary.model_dump() if payload.summary else None
    if "analysis_source" in sent:
        row.analysis_source = payload.analysis_source
    if "report" in sent:
        row.report = payload.report
    if "voice_mix" in sent:
        if payload.voice_mix is not None and len(json.dumps(payload.voice_mix)) > 20_000:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ajustes grandes demais")
        row.voice_mix = payload.voice_mix
    if "autotune" in sent:
        if payload.autotune is not None and len(json.dumps(payload.autotune)) > 2_000_000:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Ajustes grandes demais")
        row.autotune = payload.autotune
    row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return VoiceCheckDiagnosisListItem.model_validate(_list_item(row, has_report=row.summary is not None))


@router.put(
    "/{diagnosis_id}/files/{kind}",
    response_model=VoiceCheckDiagnosisListItem,
    dependencies=[Depends(verify_csrf)],
)
async def upload_file(
    diagnosis_id: str,
    kind: FileKind,
    request: Request,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
) -> VoiceCheckDiagnosisListItem:
    """Guarda o áudio original, o WAV preparado ou a versão afinada (autotune)."""
    enforce_rate_limit(
        request,
        bucket="voicecheck_store",
        limit=settings.rate_limit_upload,
        window_sec=settings.rate_limit_upload_window_sec,
    )
    row = _get_owned(db, diagnosis_id, user)

    filename = PurePosixPath((file.filename or "").replace("\\", "/")).name[:255] or kind
    if kind in ("prepared", "corrected"):
        ext = "wav"
        mime = "audio/wav"
    else:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in ORIGINAL_EXTS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de arquivo não suportado")
        declared = (file.content_type or "").lower()
        mime = declared if _SAFE_MIME.match(declared) else "application/octet-stream"

    data = await _read_limited(file)
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio")

    previous = {
        "original": row.original_size,
        "prepared": row.prepared_size,
        "corrected": row.corrected_size,
    }[kind]
    try:
        assert_can_upload(db, user.id, max(0, len(data) - previous))
    except QuotaExceeded as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=exc.message) from exc

    storage = get_storage()
    key = _storage_key(user.id, row.id, kind, ext)
    old_key = {"original": row.original_key, "prepared": row.prepared_key, "corrected": row.corrected_key}[kind]
    storage.put_bytes(key, data, mime)
    if old_key and old_key != key:
        try:
            storage.delete(old_key)
        except Exception:  # noqa: BLE001 — limpeza best-effort
            logger.warning("VoiceCheck: não apagou arquivo antigo %s", old_key, exc_info=True)

    if kind == "original":
        row.original_key = key
        row.original_mime = mime
        row.original_filename = filename
        row.original_size = len(data)
    elif kind == "prepared":
        row.prepared_key = key
        row.prepared_size = len(data)
    else:
        row.corrected_key = key
        row.corrected_size = len(data)
    row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return VoiceCheckDiagnosisListItem.model_validate(_list_item(row, has_report=row.summary is not None))


@router.get("/{diagnosis_id}/files/{kind}")
def download_file(diagnosis_id: str, kind: FileKind, user: CurrentUser, db: DbSession) -> Response:
    row = _get_owned(db, diagnosis_id, user)
    key = {"original": row.original_key, "prepared": row.prepared_key, "corrected": row.corrected_key}[kind]
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo não salvo")
    try:
        data = get_storage().get_bytes(key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("VoiceCheck: arquivo ausente no storage %s", key, exc_info=True)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo não encontrado") from exc
    mime = (row.original_mime or "application/octet-stream") if kind == "original" else "audio/wav"
    return Response(
        content=data,
        media_type=mime,
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.delete(
    "/{diagnosis_id}/files/corrected",
    response_model=VoiceCheckDiagnosisListItem,
    dependencies=[Depends(verify_csrf)],
)
def delete_corrected(diagnosis_id: str, user: CurrentUser, db: DbSession) -> VoiceCheckDiagnosisListItem:
    """Descarta a versão afinada (o original e o preparado continuam)."""
    row = _get_owned(db, diagnosis_id, user)
    if row.corrected_key:
        try:
            get_storage().delete(row.corrected_key)
        except Exception:  # noqa: BLE001
            logger.warning("VoiceCheck: não apagou %s", row.corrected_key, exc_info=True)
    row.corrected_key = None
    row.corrected_size = 0
    row.autotune = None
    row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return VoiceCheckDiagnosisListItem.model_validate(_list_item(row, has_report=row.summary is not None))


@router.delete(
    "/{diagnosis_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_csrf)],
)
def delete_diagnosis(diagnosis_id: str, user: CurrentUser, db: DbSession) -> Response:
    row = _get_owned(db, diagnosis_id, user)
    storage = get_storage()
    for key in (row.original_key, row.prepared_key, row.corrected_key):
        if key:
            try:
                storage.delete(key)
            except Exception:  # noqa: BLE001
                logger.warning("VoiceCheck: não apagou %s", key, exc_info=True)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
