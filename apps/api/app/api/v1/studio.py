from __future__ import annotations

import os
from datetime import UTC, datetime
from uuid import uuid4

from celery import Celery
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.models import ExportJob, LoopRegion, Marker, MixPreset, Stem
from app.models.entities import ExportKind, ExportStatus
from app.schemas.studio import (
    ExportCreateRequest,
    ExportJobResponse,
    LoopRegionCreate,
    LoopRegionResponse,
    LoopRegionUpdate,
    MarkerCreate,
    MarkerResponse,
    MarkerUpdate,
    MixPresetResponse,
    MixPutRequest,
    MixState,
)
from app.services.ownership import get_owned_project

router = APIRouter(tags=["studio"])
settings = get_settings()

DEFAULT_STEMS = ("vocals", "drums", "bass", "other", "instrumental")


def _default_mix_state() -> dict:
    return MixState(
        stems={s: {"volume": 1.0, "mute": False, "solo": False, "pan": 0.0} for s in DEFAULT_STEMS},
        master_gain=1.0,
    ).model_dump()


@router.get("/projects/{project_id}/mix", response_model=MixPresetResponse)
def get_mix(project_id: str, user: CurrentUser, db: DbSession) -> MixPresetResponse:
    get_owned_project(db, project_id, user)
    preset = db.scalar(
        select(MixPreset).where(
            MixPreset.project_id == project_id,
            MixPreset.owner_id == user.id,
            MixPreset.is_default.is_(True),
        )
    )
    if not preset:
        preset = MixPreset(
            id=str(uuid4()),
            project_id=project_id,
            owner_id=user.id,
            name="Padrão",
            is_default=True,
            state=_default_mix_state(),
            version=1,
        )
        db.add(preset)
        db.commit()
        db.refresh(preset)
    return MixPresetResponse.model_validate(preset)


@router.put("/projects/{project_id}/mix", response_model=MixPresetResponse, dependencies=[Depends(verify_csrf)])
def put_mix(project_id: str, payload: MixPutRequest, user: CurrentUser, db: DbSession) -> MixPresetResponse:
    get_owned_project(db, project_id, user)
    preset = db.scalar(
        select(MixPreset).where(
            MixPreset.project_id == project_id,
            MixPreset.owner_id == user.id,
            MixPreset.is_default.is_(True),
        )
    )
    state = payload.state.model_dump()
    if not preset:
        preset = MixPreset(
            id=str(uuid4()),
            project_id=project_id,
            owner_id=user.id,
            name=payload.name,
            is_default=True,
            state=state,
            version=1,
        )
        db.add(preset)
    else:
        preset.name = payload.name
        preset.state = state
        preset.version = int(preset.version or 1) + 1
        preset.is_default = True
    db.commit()
    db.refresh(preset)
    return MixPresetResponse.model_validate(preset)


@router.get("/projects/{project_id}/markers", response_model=list[MarkerResponse])
def list_markers(project_id: str, user: CurrentUser, db: DbSession) -> list[MarkerResponse]:
    get_owned_project(db, project_id, user)
    items = db.scalars(
        select(Marker).where(Marker.project_id == project_id, Marker.owner_id == user.id).order_by(Marker.position_ms)
    ).all()
    return [MarkerResponse.model_validate(m) for m in items]


@router.post(
    "/projects/{project_id}/markers",
    response_model=MarkerResponse,
    status_code=201,
    dependencies=[Depends(verify_csrf)],
)
def create_marker(
    project_id: str, payload: MarkerCreate, user: CurrentUser, db: DbSession
) -> MarkerResponse:
    get_owned_project(db, project_id, user)
    marker = Marker(
        id=str(uuid4()),
        project_id=project_id,
        owner_id=user.id,
        position_ms=payload.position_ms,
        label=payload.label.strip(),
        color=payload.color,
    )
    db.add(marker)
    db.commit()
    db.refresh(marker)
    return MarkerResponse.model_validate(marker)


@router.patch(
    "/projects/{project_id}/markers/{marker_id}",
    response_model=MarkerResponse,
    dependencies=[Depends(verify_csrf)],
)
def update_marker(
    project_id: str,
    marker_id: str,
    payload: MarkerUpdate,
    user: CurrentUser,
    db: DbSession,
) -> MarkerResponse:
    get_owned_project(db, project_id, user)
    marker = db.get(Marker, marker_id)
    if not marker or marker.project_id != project_id or marker.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Marcador não encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "label" in data and data["label"] is not None:
        data["label"] = str(data["label"]).strip()
    for key, value in data.items():
        setattr(marker, key, value)
    db.commit()
    db.refresh(marker)
    return MarkerResponse.model_validate(marker)


@router.delete(
    "/projects/{project_id}/markers/{marker_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(verify_csrf)],
)
def delete_marker(project_id: str, marker_id: str, user: CurrentUser, db: DbSession) -> Response:
    get_owned_project(db, project_id, user)
    marker = db.get(Marker, marker_id)
    if not marker or marker.project_id != project_id or marker.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Marcador não encontrado")
    db.delete(marker)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}/loop-regions", response_model=list[LoopRegionResponse])
def list_loops(project_id: str, user: CurrentUser, db: DbSession) -> list[LoopRegionResponse]:
    get_owned_project(db, project_id, user)
    items = db.scalars(
        select(LoopRegion).where(LoopRegion.project_id == project_id, LoopRegion.owner_id == user.id)
    ).all()
    return [LoopRegionResponse.model_validate(r) for r in items]


@router.post(
    "/projects/{project_id}/loop-regions",
    response_model=LoopRegionResponse,
    status_code=201,
    dependencies=[Depends(verify_csrf)],
)
def create_loop(
    project_id: str, payload: LoopRegionCreate, user: CurrentUser, db: DbSession
) -> LoopRegionResponse:
    get_owned_project(db, project_id, user)
    if payload.end_ms <= payload.start_ms:
        raise HTTPException(status_code=400, detail="end_ms deve ser maior que start_ms")
    region = LoopRegion(
        id=str(uuid4()),
        project_id=project_id,
        owner_id=user.id,
        name=payload.name.strip(),
        start_ms=payload.start_ms,
        end_ms=payload.end_ms,
    )
    db.add(region)
    db.commit()
    db.refresh(region)
    return LoopRegionResponse.model_validate(region)


@router.patch(
    "/projects/{project_id}/loop-regions/{region_id}",
    response_model=LoopRegionResponse,
    dependencies=[Depends(verify_csrf)],
)
def update_loop(
    project_id: str,
    region_id: str,
    payload: LoopRegionUpdate,
    user: CurrentUser,
    db: DbSession,
) -> LoopRegionResponse:
    get_owned_project(db, project_id, user)
    region = db.get(LoopRegion, region_id)
    if not region or region.project_id != project_id or region.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Região de loop não encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = str(data["name"]).strip()
    start = data.get("start_ms", region.start_ms)
    end = data.get("end_ms", region.end_ms)
    if end <= start:
        raise HTTPException(status_code=400, detail="end_ms deve ser maior que start_ms")
    for key, value in data.items():
        setattr(region, key, value)
    db.commit()
    db.refresh(region)
    return LoopRegionResponse.model_validate(region)


@router.delete(
    "/projects/{project_id}/loop-regions/{region_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    dependencies=[Depends(verify_csrf)],
)
def delete_loop(project_id: str, region_id: str, user: CurrentUser, db: DbSession) -> Response:
    get_owned_project(db, project_id, user)
    region = db.get(LoopRegion, region_id)
    if not region or region.project_id != project_id or region.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Região de loop não encontrada")
    db.delete(region)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _enqueue_export(job_id: str) -> None:
    broker = os.getenv("CELERY_BROKER_URL", settings.celery_broker_url or settings.redis_url)
    Celery("estudio_api_client", broker=broker).send_task("worker.tasks.export.run_export", args=[job_id])


@router.post(
    "/projects/{project_id}/exports",
    response_model=ExportJobResponse,
    status_code=201,
    dependencies=[Depends(verify_csrf)],
)
def create_export(
    project_id: str,
    payload: ExportCreateRequest,
    user: CurrentUser,
    db: DbSession,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> ExportJobResponse:
    if not idempotency_key or len(idempotency_key) < 8:
        raise HTTPException(status_code=400, detail="Idempotency-Key obrigatório")
    get_owned_project(db, project_id, user)

    try:
        kind = ExportKind(payload.kind)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="kind inválido") from exc

    existing = db.scalar(select(ExportJob).where(ExportJob.idempotency_key == idempotency_key))
    if existing:
        if existing.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Idempotency-Key de outro usuário")
        return ExportJobResponse.model_validate(existing)

    stems = db.scalars(select(Stem).where(Stem.project_id == project_id, Stem.owner_id == user.id)).all()
    if not stems:
        raise HTTPException(status_code=400, detail="Projeto sem stems para exportar")

    job = ExportJob(
        id=str(uuid4()),
        project_id=project_id,
        owner_id=user.id,
        kind=kind,
        status=ExportStatus.queued,
        params=payload.params or {},
        idempotency_key=idempotency_key,
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(ExportJob).where(ExportJob.idempotency_key == idempotency_key))
        if existing and existing.owner_id == user.id:
            return ExportJobResponse.model_validate(existing)
        raise
    db.refresh(job)
    _enqueue_export(job.id)
    return ExportJobResponse.model_validate(job)


@router.get("/export-jobs/{job_id}", response_model=ExportJobResponse)
def get_export(job_id: str, user: CurrentUser, db: DbSession) -> ExportJobResponse:
    job = db.get(ExportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Export job não encontrado")
    if job.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    return ExportJobResponse.model_validate(job)
