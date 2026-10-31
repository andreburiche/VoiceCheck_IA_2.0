from __future__ import annotations

import hashlib
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.models import AudioAsset
from app.models.entities import AssetKind, AssetStatus
from app.schemas.uploads import (
    AudioAssetResponse,
    UploadCompleteRequest,
    UploadInitiateRequest,
    UploadInitiateResponse,
)
from app.services.media import probe_with_ffprobe, resolve_format, sniff_mime
from app.services.ownership import get_owned_asset, get_owned_project
from app.services.quotas import QuotaExceeded, assert_can_upload
from app.services.storage import LocalStorageAdapter, get_storage

router = APIRouter(prefix="/uploads", tags=["uploads"])
settings = get_settings()


@router.post(
    "/initiate",
    response_model=UploadInitiateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
def initiate_upload(
    payload: UploadInitiateRequest,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> UploadInitiateResponse:
    enforce_rate_limit(
        request,
        bucket="upload",
        limit=settings.rate_limit_upload,
        window_sec=settings.rate_limit_upload_window_sec,
    )
    if not payload.rights_confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="É necessário confirmar o direito de uso da obra",
        )
    if payload.size_bytes > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Arquivo excede o limite de {settings.max_upload_bytes} bytes",
        )

    get_owned_project(db, payload.project_id, user)
    try:
        assert_can_upload(db, user.id, payload.size_bytes)
    except QuotaExceeded as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=exc.message) from exc

    try:
        # Validação preliminar só do MIME declarado (conteúdo real no complete)
        from app.services.media import ALLOWED_MIME_TO_FORMAT, normalize_declared_mime

        declared = normalize_declared_mime(payload.mime_type)
        if declared not in ALLOWED_MIME_TO_FORMAT:
            raise ValueError(f"MIME não suportado: {declared}")
        fmt = ALLOWED_MIME_TO_FORMAT[declared]
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    asset_id = str(uuid4())
    storage_key = f"originals/{user.id}/{payload.project_id}/{asset_id}.{fmt}"

    asset = AudioAsset(
        id=asset_id,
        owner_id=user.id,
        project_id=payload.project_id,
        kind=AssetKind.original,
        storage_key=storage_key,
        mime_type=declared,
        format=fmt,
        checksum_sha256=payload.checksum_sha256.lower(),
        size_bytes=payload.size_bytes,
        original_filename=payload.filename,
        status=AssetStatus.pending,
    )
    db.add(asset)
    db.commit()

    storage = get_storage()
    ttl = settings.s3_presign_ttl_seconds
    upload_url = storage.upload_url(storage_key, declared, ttl)
    return UploadInitiateResponse(
        asset_id=asset_id,
        upload_url=upload_url,
        storage_key=storage_key,
        expires_in=ttl,
        method="PUT",
    )


@router.put("/local")
async def local_upload_put(
    request: Request,
    db: DbSession,
    key: str = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
    ct: str = Query(default="application/octet-stream"),
) -> Response:
    """Recebe bytes no adapter local (URL assinada). Sem cookie — assinatura HMAC."""
    storage = get_storage()
    if not isinstance(storage, LocalStorageAdapter):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint só para storage local")
    if not storage.verify_signature(key, exp, "upload", sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="URL de upload inválida ou expirada")

    # A URL assinada vale pelo TTL inteiro: sem esta checagem ela poderia ser
    # reusada depois do /complete para trocar um arquivo já validado.
    asset = db.scalar(select(AudioAsset).where(AudioAsset.storage_key == key))
    if asset is None or asset.status != AssetStatus.pending or asset.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Upload já concluído ou inexistente")

    declared_len = request.headers.get("content-length")
    if declared_len and declared_len.isdigit() and int(declared_len) > settings.max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Arquivo muito grande")

    # lê em blocos e para ao passar do limite: sem Content-Length (chunked) o corpo inteiro iria para a memória
    partes: list[bytes] = []
    total = 0
    async for bloco in request.stream():
        total += len(bloco)
        if total > settings.max_upload_bytes:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Arquivo muito grande")
        partes.append(bloco)
    body = b"".join(partes)
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Corpo vazio")

    storage.put_bytes(key, body, ct)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/complete",
    response_model=AudioAssetResponse,
    dependencies=[Depends(verify_csrf)],
)
def complete_upload(
    payload: UploadCompleteRequest,
    user: CurrentUser,
    db: DbSession,
) -> AudioAssetResponse:
    asset = get_owned_asset(db, payload.asset_id, user)
    if asset.status == AssetStatus.ready:
        return AudioAssetResponse.model_validate(asset)
    if asset.status != AssetStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Asset não está pendente")

    if payload.checksum_sha256.lower() != (asset.checksum_sha256 or "").lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Checksum não confere com o initiate")

    storage = get_storage()
    if not storage.exists(asset.storage_key):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo ainda não foi enviado")

    size = storage.size(asset.storage_key)
    if size != asset.size_bytes:
        asset.status = AssetStatus.failed
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tamanho divergente: esperado {asset.size_bytes}, recebido {size}",
        )
    if size > settings.max_upload_bytes:
        asset.status = AssetStatus.failed
        db.commit()
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Arquivo muito grande")

    data = storage.get_bytes(asset.storage_key)
    digest = hashlib.sha256(data).hexdigest()
    if digest != payload.checksum_sha256.lower():
        asset.status = AssetStatus.failed
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Integridade SHA-256 inválida")

    detected = sniff_mime(data[:64])
    try:
        mime, fmt = resolve_format(asset.mime_type, detected, asset.original_filename)
    except ValueError as exc:
        asset.status = AssetStatus.failed
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    duration_ms: int | None = None
    sample_rate: int | None = None
    channels: int | None = None
    with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    try:
        duration_ms, sample_rate, channels = probe_with_ffprobe(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    if duration_ms is not None:
        if duration_ms <= 0:
            asset.status = AssetStatus.failed
            db.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duração inválida")
        if duration_ms > settings.max_duration_seconds * 1000:
            asset.status = AssetStatus.failed
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duração excede {settings.max_duration_seconds}s",
            )

    asset.mime_type = mime
    asset.format = fmt
    asset.duration_ms = duration_ms
    asset.sample_rate = sample_rate
    asset.channels = channels
    asset.checksum_sha256 = digest
    asset.status = AssetStatus.ready
    db.commit()
    db.refresh(asset)
    return AudioAssetResponse.model_validate(asset)


@router.get("/pending/{asset_id}", response_model=AudioAssetResponse)
def get_upload_asset(asset_id: str, user: CurrentUser, db: DbSession) -> AudioAssetResponse:
    asset = get_owned_asset(db, asset_id, user)
    return AudioAssetResponse.model_validate(asset)
