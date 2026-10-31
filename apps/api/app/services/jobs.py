"""Criação de jobs e publicação de eventos (Redis)."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

import redis
from celery import Celery
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AudioAsset, ProcessingJob, ProcessingModel, Project
from app.models.entities import AssetStatus, JobStatus
from app.services.quotas import QuotaExceeded, assert_can_start_separation

settings = get_settings()
logger = logging.getLogger(__name__)

# Re-export para handlers
__all__ = [
    "BrokerUnavailable",
    "redis_client",
    "publish_job_event",
    "enqueue_separation",
    "enqueue_vocal_transcription",
    "create_separation_job",
    "QuotaExceeded",
]


class BrokerUnavailable(RuntimeError):
    """Redis/Celery indisponível — não dá para enfileirar o worker."""

    def __init__(self, message: str | None = None) -> None:
        super().__init__(
            message
            or (
                "Fila de processamento indisponível (Redis/worker). "
                "Com Docker: suba mysql, redis, api e worker. "
                "Sem Docker o job não pode ser enfileirado."
            )
        )


def redis_client() -> redis.Redis:
    return redis.Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=1.0,
        socket_timeout=2.0,
        retry_on_timeout=False,
    )


def publish_job_event(job_id: str, event: dict[str, Any]) -> None:
    payload = {"job_id": job_id, "ts": datetime.now(UTC).isoformat(), **event}
    try:
        r = redis_client()
        channel = f"job:{job_id}:events"
        r.publish(channel, json.dumps(payload))
        r.lpush(f"job:{job_id}:events:log", json.dumps(payload))
        r.ltrim(f"job:{job_id}:events:log", 0, 99)
    except redis.RedisError as exc:
        # Eventos são best-effort; o enfileiramento é que falha de forma dura.
        logger.warning("publish_job_event_failed job_id=%s error=%s", job_id, exc)


def _celery_client() -> Celery:
    broker = os.getenv("CELERY_BROKER_URL", settings.celery_broker_url or settings.redis_url)
    try:
        redis_client().ping()
    except redis.RedisError as exc:
        raise BrokerUnavailable() from exc
    celery = Celery("estudio_api_client", broker=broker)
    celery.conf.broker_connection_timeout = 2
    celery.conf.broker_connection_retry_on_startup = False
    return celery


def enqueue_separation(job_id: str) -> None:
    try:
        _celery_client().send_task("worker.tasks.separate.run_separation", args=[job_id])
    except BrokerUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001 — broker/celery pode falhar de várias formas
        raise BrokerUnavailable() from exc


def enqueue_vocal_transcription(transcription_id: str) -> None:
    try:
        _celery_client().send_task(
            "worker.tasks.transcribe_vocal.run_transcription",
            args=[transcription_id],
        )
    except BrokerUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001
        raise BrokerUnavailable() from exc


def create_separation_job(
    db: Session,
    *,
    project: Project,
    asset: AudioAsset,
    owner_id: str,
    model_code: str,
    params: dict[str, Any],
    idempotency_key: str,
) -> tuple[ProcessingJob, bool]:
    """Retorna (job, created)."""
    existing = db.scalar(select(ProcessingJob).where(ProcessingJob.idempotency_key == idempotency_key))
    if existing:
        if existing.owner_id != owner_id:
            raise PermissionError("Idempotency-Key pertence a outro usuário")
        return existing, False

    if asset.owner_id != owner_id or asset.project_id != project.id:
        raise PermissionError("Asset não pertence ao projeto")
    if asset.status != AssetStatus.ready:
        raise ValueError("Asset de origem precisa estar ready")
    if asset.deleted_at is not None:
        raise ValueError("Asset removido")

    model = db.scalar(
        select(ProcessingModel).where(ProcessingModel.code == model_code, ProcessingModel.is_enabled.is_(True))
    )
    if not model:
        raise ValueError(f"Modelo indisponível: {model_code}")

    # params viram argumentos do Demucs no worker: só os conhecidos, nos limites (separacao.py)
    from pydantic import ValidationError

    from app.services.separacao import ParametrosSeparacao

    try:
        params = ParametrosSeparacao.model_validate(params or {}).model_dump(exclude_none=True)
    except ValidationError as exc:
        campos = ", ".join(".".join(str(p) for p in e["loc"]) or "params" for e in exc.errors())
        raise ValueError(f"Parâmetros de separação inválidos: {campos}") from exc

    assert_can_start_separation(db, owner_id, asset.duration_ms)

    job = ProcessingJob(
        id=str(uuid4()),
        owner_id=owner_id,
        project_id=project.id,
        source_asset_id=asset.id,
        model_id=model.id,
        status=JobStatus.queued,
        progress=Decimal("0"),
        idempotency_key=idempotency_key,
        params=params or {},
        model_version=model.version,
        attempt=0,
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(ProcessingJob).where(ProcessingJob.idempotency_key == idempotency_key))
        if existing and existing.owner_id == owner_id:
            return existing, False
        raise
    db.refresh(job)

    publish_job_event(job.id, {"type": "status", "status": job.status.value, "progress": float(job.progress)})
    try:
        enqueue_separation(job.id)
    except BrokerUnavailable:
        # Sem Docker/Redis: em modo contract, completa inline para o fluxo local não travar.
        if settings.allow_contract_stems and settings.separation_adapter.lower() == "contract":
            from app.services.inline_contract import complete_job_with_contract_stems

            logger.warning(
                "broker_unavailable_inline_contract job_id=%s",
                job.id,
            )
            job = complete_job_with_contract_stems(db, job)
            return job, True

        job.status = JobStatus.failed
        job.error_code = "BROKER_UNAVAILABLE"
        job.error_message = (
            "Redis/worker indisponível. Suba o stack Docker (redis + worker) "
            "para processar a separação, ou use ALLOW_CONTRACT_STEMS=1 com "
            "SEPARATION_ADAPTER=contract para smoke local."
        )
        job.finished_at = datetime.now(UTC)
        db.commit()
        db.refresh(job)
        raise

    return job, True
