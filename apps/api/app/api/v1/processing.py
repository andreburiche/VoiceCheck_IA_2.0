from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.models import AudioAsset, ProcessingJob, ProcessingModel, Stem
from app.models.entities import JobStatus
from app.schemas.processing import (
    MessageResponse,
    ProcessingJobListResponse,
    ProcessingJobResponse,
    SeparationCreateRequest,
    StemListResponse,
    StemResponse,
)
from app.services.audit import write_audit
from app.services.jobs import BrokerUnavailable, create_separation_job, publish_job_event, redis_client
from app.services.ownership import get_owned_project
from app.services.quotas import QuotaExceeded
from app.core import metrics as app_metrics

router = APIRouter(tags=["processing"])


def _job_response(db: DbSession, job: ProcessingJob) -> ProcessingJobResponse:
    data = ProcessingJobResponse.model_validate(job)
    model = db.get(ProcessingModel, job.model_id)
    if model:
        data.model_code = model.code
    return data


@router.get(
    "/projects/{project_id}/separations",
    response_model=ProcessingJobListResponse,
)
def list_separations(
    project_id: str,
    user: CurrentUser,
    db: DbSession,
) -> ProcessingJobListResponse:
    get_owned_project(db, project_id, user)
    rows = list(
        db.scalars(
            select(ProcessingJob)
            .where(ProcessingJob.project_id == project_id, ProcessingJob.owner_id == user.id)
            .order_by(ProcessingJob.created_at.desc())
            .limit(50)
        ).all()
    )
    return ProcessingJobListResponse(items=[_job_response(db, j) for j in rows], total=len(rows))


@router.post(
    "/projects/{project_id}/separations",
    response_model=ProcessingJobResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)],
)
def create_separation(
    project_id: str,
    payload: SeparationCreateRequest,
    user: CurrentUser,
    db: DbSession,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> ProcessingJobResponse:
    if not idempotency_key or len(idempotency_key) < 8:
        raise HTTPException(status_code=400, detail="Header Idempotency-Key obrigatório (≥8 caracteres)")

    project = get_owned_project(db, project_id, user)
    asset = db.get(AudioAsset, payload.source_asset_id)
    if not asset or asset.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Asset não encontrado")

    try:
        job, created = create_separation_job(
            db,
            project=project,
            asset=asset,
            owner_id=user.id,
            model_code=payload.model_code,
            params=payload.params,
            idempotency_key=idempotency_key,
        )
    except QuotaExceeded as exc:
        app_metrics.JOBS_QUOTA_REJECTED.inc()
        raise HTTPException(status_code=402, detail=exc.message) from exc
    except BrokerUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if created:
        app_metrics.JOBS_CREATED.inc()
        write_audit(
            db,
            action="separation.create",
            resource_type="processing_job",
            resource_id=job.id,
            actor_id=user.id,
            request=request,
            meta={"project_id": project_id, "model": payload.model_code},
            commit=True,
        )
    return _job_response(db, job)


@router.get("/processing-jobs/{job_id}", response_model=ProcessingJobResponse)
def get_job(job_id: str, user: CurrentUser, db: DbSession) -> ProcessingJobResponse:
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    if job.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    return _job_response(db, job)


@router.post(
    "/processing-jobs/{job_id}/cancel",
    response_model=MessageResponse,
    dependencies=[Depends(verify_csrf)],
)
def cancel_job(
    job_id: str,
    user: CurrentUser,
    db: DbSession,
    request: Request,
) -> MessageResponse:
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    if job.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    if job.status in (JobStatus.completed, JobStatus.failed, JobStatus.cancelled):
        raise HTTPException(status_code=409, detail=f"Job já finalizado ({job.status.value})")

    previous = job.status.value
    job.status = JobStatus.cancelled
    job.finished_at = datetime.now(UTC)
    job.error_code = "CANCELLED"
    job.error_message = "Cancelado pelo usuário"
    write_audit(
        db,
        action="separation.cancel",
        resource_type="processing_job",
        resource_id=job.id,
        actor_id=user.id,
        request=request,
        meta={"previous_status": previous},
    )
    db.commit()
    app_metrics.JOBS_CANCELLED.inc()
    publish_job_event(job.id, {"type": "status", "status": "cancelled", "progress": float(job.progress)})
    return MessageResponse(message="Cancelamento solicitado")


@router.get("/projects/{project_id}/stems", response_model=StemListResponse)
def list_stems(
    project_id: str,
    user: CurrentUser,
    db: DbSession,
    job_id: str | None = None,
) -> StemListResponse:
    get_owned_project(db, project_id, user)
    q = select(Stem).where(Stem.project_id == project_id, Stem.owner_id == user.id)
    if job_id:
        q = q.where(Stem.job_id == job_id)
    items = db.scalars(q.order_by(Stem.order_index.asc(), Stem.created_at.desc())).all()
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    return StemListResponse(items=[StemResponse.model_validate(s) for s in items], total=total)


@router.get("/processing-jobs/{job_id}/events")
async def job_events(job_id: str, request: Request, user: CurrentUser, db: DbSession) -> StreamingResponse:
    job = db.get(ProcessingJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    if job.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")

    async def event_stream():
        # O cliente Redis é síncrono: toda chamada que pode bloquear roda em
        # thread (asyncio.to_thread) para não travar o event loop da API.
        r = redis_client()
        # replay recent
        recent = await asyncio.to_thread(r.lrange, f"job:{job_id}:events:log", 0, 20)
        for raw in reversed(recent or []):
            yield f"data: {raw}\n\n"

        pubsub = r.pubsub()
        await asyncio.to_thread(pubsub.subscribe, f"job:{job_id}:events")
        try:
            while True:
                if await request.is_disconnected():
                    break
                message = await asyncio.to_thread(
                    pubsub.get_message, ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message.get("type") == "message":
                    data = message["data"]
                    yield f"data: {data}\n\n"
                    try:
                        parsed = json.loads(data)
                        if parsed.get("status") in {"completed", "failed", "cancelled"}:
                            break
                    except json.JSONDecodeError:
                        pass
                else:
                    # heartbeat + polling fallback hint
                    await asyncio.to_thread(db.refresh, job)
                    yield f"data: {json.dumps({'type': 'ping', 'status': job.status.value, 'progress': float(job.progress)})}\n\n"
                    if job.status in (JobStatus.completed, JobStatus.failed, JobStatus.cancelled):
                        break
                await asyncio.sleep(0.5)
        finally:
            try:
                await asyncio.to_thread(pubsub.unsubscribe, f"job:{job_id}:events")
            finally:
                await asyncio.to_thread(pubsub.close)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
