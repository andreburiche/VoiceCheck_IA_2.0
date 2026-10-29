from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import Response as FastAPIResponse
from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession
from app.models import AudioAsset
from app.models.entities import AssetKind, AssetStatus
from app.schemas.uploads import AudioAssetListResponse, AudioAssetResponse, PlaybackUrlResponse
from app.services.ownership import get_owned_asset
from app.services.storage import LocalStorageAdapter, get_storage

router = APIRouter(prefix="/audio-assets", tags=["audio-assets"])


def _content_disposition(filename: str) -> str:
    """Content-Disposition seguro: fallback ASCII sem aspas/controle + filename* (RFC 5987)."""
    ascii_name = "".join(
        ch if 32 <= ord(ch) < 127 and ch not in '"\\;' else "_" for ch in filename
    ).strip() or "audio"
    return f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename, safe='')}"


settings = get_settings()


@router.get("/local-download")
def local_download(
    key: str = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
    filename: str | None = Query(default=None),
) -> FastAPIResponse:
    storage = get_storage()
    if not isinstance(storage, LocalStorageAdapter):
        raise HTTPException(status_code=404, detail="Endpoint só para storage local")
    if not storage.verify_signature(key, exp, "download", sig, filename):
        raise HTTPException(status_code=403, detail="URL inválida ou expirada")
    if not storage.exists(key):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    data = storage.get_bytes(key)
    headers = {"Cache-Control": "private, max-age=60"}
    if filename:
        headers["Content-Disposition"] = _content_disposition(filename)
    return Response(content=data, media_type="application/octet-stream", headers=headers)


@router.get("", response_model=AudioAssetListResponse)
def list_assets(
    user: CurrentUser,
    db: DbSession,
    kind: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> AudioAssetListResponse:
    base = select(AudioAsset).where(AudioAsset.owner_id == user.id, AudioAsset.deleted_at.is_(None))
    if kind:
        try:
            base = base.where(AudioAsset.kind == AssetKind(kind))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="kind inválido") from exc
    if status_filter:
        try:
            base = base.where(AudioAsset.status == AssetStatus(status_filter))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="status inválido") from exc

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(base.order_by(AudioAsset.created_at.desc()).limit(limit).offset(offset)).all()
    return AudioAssetListResponse(
        items=[AudioAssetResponse.model_validate(a) for a in items],
        total=total,
    )


@router.get("/{asset_id}/playback-url", response_model=PlaybackUrlResponse)
def playback_url(asset_id: str, user: CurrentUser, db: DbSession) -> PlaybackUrlResponse:
    asset = get_owned_asset(db, asset_id, user)
    if asset.status != AssetStatus.ready:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Asset ainda não está pronto")
    storage = get_storage()
    ttl = settings.s3_presign_ttl_seconds
    url = storage.download_url(asset.storage_key, ttl, filename=asset.original_filename)
    return PlaybackUrlResponse(url=url, expires_in=ttl)


@router.get("/{asset_id}", response_model=AudioAssetResponse)
def get_asset(asset_id: str, user: CurrentUser, db: DbSession) -> AudioAssetResponse:
    return AudioAssetResponse.model_validate(get_owned_asset(db, asset_id, user))
