from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.models.entities import (
    AudioAsset,
    ScoreVersion,
    Stem,
    StemType,
    TranscriptionNote,
    VocalPart,
    VocalTranscription,
    VocalTranscriptionStatus,
    VocalVoiceRole,
)
from app.schemas.vocal import (
    NotesReplaceRequest,
    PartAnnotationUpdate,
    PartCreateRequest,
    PartRoleUpdate,
    TranscriptionCreateRequest,
    TranscriptionListOut,
    TranscriptionOut,
    WorkerTranscriptionRequest,
)
from app.services.jobs import BrokerUnavailable, enqueue_vocal_transcription
from app.services.ownership import get_owned_project

router = APIRouter(tags=["vocal"])


def _role(value: str) -> VocalVoiceRole:
    try:
        return VocalVoiceRole(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"voice_role inválido: {value}") from exc


def _status(value: str) -> VocalTranscriptionStatus:
    try:
        return VocalTranscriptionStatus(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"status inválido: {value}") from exc


def _load_tx(db: DbSession, transcription_id: str, user_id: str) -> VocalTranscription:
    tx = db.scalar(
        select(VocalTranscription)
        .where(VocalTranscription.id == transcription_id, VocalTranscription.owner_id == user_id)
        .options(
            selectinload(VocalTranscription.parts).selectinload(VocalPart.notes),
            selectinload(VocalTranscription.versions),
        )
    )
    if not tx:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transcrição não encontrada")
    return tx


@router.get("/projects/{project_id}/vocal-transcriptions", response_model=TranscriptionListOut)
def list_transcriptions(project_id: str, user: CurrentUser, db: DbSession) -> TranscriptionListOut:
    get_owned_project(db, project_id, user)
    rows = db.scalars(
        select(VocalTranscription)
        .where(
            VocalTranscription.project_id == project_id,
            VocalTranscription.owner_id == user.id,
        )
        .options(selectinload(VocalTranscription.parts).selectinload(VocalPart.notes))
        .order_by(VocalTranscription.created_at.desc())
    ).all()
    return TranscriptionListOut(items=list(rows), total=len(rows))


@router.post(
    "/projects/{project_id}/vocal-transcriptions",
    response_model=TranscriptionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
def create_transcription(
    project_id: str,
    payload: TranscriptionCreateRequest,
    user: CurrentUser,
    db: DbSession,
) -> TranscriptionOut:
    get_owned_project(db, project_id, user)
    asset = db.get(AudioAsset, payload.source_asset_id)
    if not asset or asset.owner_id != user.id or asset.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset de origem não encontrado")

    tx = VocalTranscription(
        id=str(uuid4()),
        project_id=project_id,
        owner_id=user.id,
        source_asset_id=payload.source_asset_id,
        status=_status(payload.status),
        engine=payload.engine[:64],
        bpm=Decimal(str(payload.bpm)) if payload.bpm is not None else None,
        musical_key=payload.musical_key,
        confidence=Decimal(str(round(payload.confidence, 4))) if payload.confidence is not None else None,
        polyphony_warning=payload.polyphony_warning,
        meta=payload.meta or {},
    )
    db.add(tx)
    db.flush()

    for i, p in enumerate(payload.parts or []):
        part = VocalPart(
            id=str(uuid4()),
            transcription_id=tx.id,
            label=p.label,
            voice_role=_role(p.voice_role),
            needs_review=p.needs_review,
            order_index=p.order_index if p.order_index is not None else i,
        )
        db.add(part)
        db.flush()
        for n in p.notes:
            if n.end_ms < n.start_ms:
                continue
            db.add(
                TranscriptionNote(
                    id=str(uuid4()),
                    part_id=part.id,
                    pitch_midi=n.pitch_midi,
                    start_ms=n.start_ms,
                    end_ms=n.end_ms,
                    velocity=n.velocity,
                    is_rest=n.is_rest,
                    tie_group=n.tie_group,
                    lyric_syllable=n.lyric_syllable,
                )
            )

    db.add(
        ScoreVersion(
            id=str(uuid4()),
            transcription_id=tx.id,
            version=1,
            musicxml=payload.musicxml,
            snapshot_json={"parts": [p.model_dump() for p in payload.parts]},
            label="Transcrição inicial",
        )
    )
    db.commit()
    return TranscriptionOut.model_validate(_load_tx(db, tx.id, user.id))


@router.get("/vocal-transcriptions/{transcription_id}", response_model=TranscriptionOut)
def get_transcription(transcription_id: str, user: CurrentUser, db: DbSession) -> TranscriptionOut:
    return TranscriptionOut.model_validate(_load_tx(db, transcription_id, user.id))


@router.post(
    "/projects/{project_id}/vocal-transcriptions/worker",
    response_model=TranscriptionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
def enqueue_worker_transcription(
    project_id: str,
    payload: WorkerTranscriptionRequest,
    user: CurrentUser,
    db: DbSession,
) -> TranscriptionOut:
    """Fase worker — Basic Pitch se instalado; senão YIN numpy no Celery."""
    get_owned_project(db, project_id, user)

    source_id = payload.source_asset_id
    if not source_id:
        stem = db.scalar(
            select(Stem)
            .where(
                Stem.project_id == project_id,
                Stem.owner_id == user.id,
                Stem.stem_type == StemType.vocals,
            )
            .order_by(Stem.created_at.desc())
        )
        if not stem:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Stem vocals não encontrado — rode a separação 4 stems ou informe source_asset_id",
            )
        source_id = stem.asset_id

    asset = db.get(AudioAsset, source_id)
    if not asset or asset.owner_id != user.id or asset.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset de origem não encontrado")

    role = _role(payload.voice_role)
    tx = VocalTranscription(
        id=str(uuid4()),
        project_id=project_id,
        owner_id=user.id,
        source_asset_id=source_id,
        status=VocalTranscriptionStatus.draft,
        engine="worker_pending",
        polyphony_warning=True,
        meta={
            "worker_state": "queued",
            "part_label": payload.label.strip(),
            "voice_role": role.value,
            "source": "worker_queue",
        },
    )
    db.add(tx)
    db.commit()

    try:
        enqueue_vocal_transcription(tx.id)
    except BrokerUnavailable as exc:
        tx.status = VocalTranscriptionStatus.failed
        meta = dict(tx.meta or {})
        meta["worker_state"] = "failed"
        meta["error"] = "BROKER_UNAVAILABLE"
        tx.meta = meta
        db.commit()
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    return TranscriptionOut.model_validate(_load_tx(db, tx.id, user.id))


@router.post(
    "/vocal-transcriptions/{transcription_id}/parts",
    response_model=TranscriptionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
def add_part(
    transcription_id: str,
    payload: PartCreateRequest,
    user: CurrentUser,
    db: DbSession,
) -> TranscriptionOut:
    """Fase 4 — adiciona parte manual (SATB / voz N). Sem split IA."""
    tx = _load_tx(db, transcription_id, user.id)
    if len(tx.parts) >= 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Máximo de 8 partes por transcrição")

    if payload.audio_asset_id:
        asset = db.get(AudioAsset, payload.audio_asset_id)
        if not asset or asset.owner_id != user.id or asset.deleted_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset de áudio da parte não encontrado")

    next_order = (
        payload.order_index
        if payload.order_index is not None
        else (max((p.order_index for p in tx.parts), default=-1) + 1)
    )
    part = VocalPart(
        id=str(uuid4()),
        transcription_id=tx.id,
        label=payload.label.strip(),
        voice_role=_role(payload.voice_role),
        needs_review=payload.needs_review,
        order_index=next_order,
        audio_asset_id=payload.audio_asset_id,
    )
    db.add(part)
    db.flush()
    for n in payload.notes:
        if n.end_ms < n.start_ms:
            continue
        db.add(
            TranscriptionNote(
                id=str(uuid4()),
                part_id=part.id,
                pitch_midi=n.pitch_midi,
                start_ms=n.start_ms,
                end_ms=n.end_ms,
                velocity=n.velocity,
                is_rest=n.is_rest,
                tie_group=n.tie_group,
                lyric_syllable=n.lyric_syllable,
            )
        )
    meta = dict(tx.meta or {})
    annotations = dict(meta.get("part_annotations") or {})
    if payload.annotation:
        annotations[part.id] = payload.annotation
        meta["part_annotations"] = annotations
        tx.meta = meta
    tx.polyphony_warning = True
    if any(p.needs_review for p in tx.parts) or payload.needs_review:
        tx.status = VocalTranscriptionStatus.needs_review
    db.commit()
    return TranscriptionOut.model_validate(_load_tx(db, tx.id, user.id))


@router.delete(
    "/vocal-parts/{part_id}",
    response_model=TranscriptionOut,
    dependencies=[Depends(verify_csrf)],
)
def delete_part(part_id: str, user: CurrentUser, db: DbSession) -> TranscriptionOut:
    part = db.get(VocalPart, part_id)
    if not part:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parte não encontrada")
    tx = _load_tx(db, part.transcription_id, user.id)
    if len(tx.parts) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mantenha ao menos uma parte")
    meta = dict(tx.meta or {})
    annotations = dict(meta.get("part_annotations") or {})
    if part.id in annotations:
        annotations.pop(part.id, None)
        meta["part_annotations"] = annotations
        tx.meta = meta
    db.delete(part)
    db.commit()
    return TranscriptionOut.model_validate(_load_tx(db, tx.id, user.id))


@router.patch(
    "/vocal-parts/{part_id}",
    response_model=TranscriptionOut,
    dependencies=[Depends(verify_csrf)],
)
def update_part_role(
    part_id: str,
    payload: PartRoleUpdate,
    user: CurrentUser,
    db: DbSession,
) -> TranscriptionOut:
    part = db.get(VocalPart, part_id)
    if not part:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parte não encontrada")
    tx = _load_tx(db, part.transcription_id, user.id)
    part.voice_role = _role(payload.voice_role)
    if payload.label is not None:
        part.label = payload.label.strip() or part.label
    if payload.needs_review is not None:
        part.needs_review = payload.needs_review
    db.commit()
    return TranscriptionOut.model_validate(_load_tx(db, tx.id, user.id))


@router.patch(
    "/vocal-parts/{part_id}/annotation",
    response_model=TranscriptionOut,
    dependencies=[Depends(verify_csrf)],
)
def update_part_annotation(
    part_id: str,
    payload: PartAnnotationUpdate,
    user: CurrentUser,
    db: DbSession,
) -> TranscriptionOut:
    """Fase 5 — anotação de treino por parte (meta JSON)."""
    part = db.get(VocalPart, part_id)
    if not part:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parte não encontrada")
    tx = _load_tx(db, part.transcription_id, user.id)
    meta = dict(tx.meta or {})
    annotations = dict(meta.get("part_annotations") or {})
    text = (payload.annotation or "").strip()
    if text:
        annotations[part.id] = text[:2000]
    else:
        annotations.pop(part.id, None)
    meta["part_annotations"] = annotations
    tx.meta = meta
    db.commit()
    return TranscriptionOut.model_validate(_load_tx(db, tx.id, user.id))


@router.put(
    "/vocal-parts/{part_id}/notes",
    response_model=TranscriptionOut,
    dependencies=[Depends(verify_csrf)],
)
def replace_part_notes(
    part_id: str,
    payload: NotesReplaceRequest,
    user: CurrentUser,
    db: DbSession,
) -> TranscriptionOut:
    part = db.get(VocalPart, part_id)
    if not part:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parte não encontrada")
    tx = _load_tx(db, part.transcription_id, user.id)

    for n in list(part.notes):
        db.delete(n)
    db.flush()
    for n in payload.notes:
        if n.end_ms < n.start_ms:
            continue
        db.add(
            TranscriptionNote(
                id=str(uuid4()),
                part_id=part.id,
                pitch_midi=n.pitch_midi,
                start_ms=n.start_ms,
                end_ms=n.end_ms,
                velocity=n.velocity,
                is_rest=n.is_rest,
                tie_group=n.tie_group,
                lyric_syllable=n.lyric_syllable,
            )
        )

    next_ver = (max((v.version for v in tx.versions), default=0)) + 1
    db.add(
        ScoreVersion(
            id=str(uuid4()),
            transcription_id=tx.id,
            version=next_ver,
            musicxml=payload.musicxml,
            snapshot_json={"part_id": part.id, "notes": [n.model_dump() for n in payload.notes]},
            label=payload.label or f"v{next_ver}",
        )
    )
    tx.status = VocalTranscriptionStatus.ready
    db.commit()
    return TranscriptionOut.model_validate(_load_tx(db, tx.id, user.id))
