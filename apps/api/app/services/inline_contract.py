"""Fallback local sem Redis/worker: gera stems silenciosos (somente contract/dev)."""

from __future__ import annotations

import hashlib
import logging
import struct
import wave
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models import AudioAsset, ProcessingJob, Stem, UsageLedger
from app.models.entities import AssetKind, AssetStatus, JobStatus, StemType, UsageKind, UsageUnit
from app.services.storage import get_storage

logger = logging.getLogger(__name__)

STEMS = ("vocals", "drums", "bass", "other")


def _silence_wav_bytes(*, duration_ms: int | None, sample_rate: int = 44100, channels: int = 2) -> bytes:
    ms = max(duration_ms or 1000, 100)
    frames = max(int(sample_rate * (ms / 1000.0)), 1)
    buf = BytesIO()
    with wave.open(buf, "w") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        silence = struct.pack("<h", 0) * channels
        for _ in range(frames):
            wf.writeframesraw(silence)
    return buf.getvalue()


def complete_job_with_contract_stems(db: Session, job: ProcessingJob) -> ProcessingJob:
    """Marca o job como completed com 4 stems WAV silenciosos (smoke local)."""
    storage = get_storage()
    source = db.get(AudioAsset, job.source_asset_id)
    if not source:
        job.status = JobStatus.failed
        job.error_code = "SOURCE_MISSING"
        job.error_message = "Asset de origem ausente"
        job.finished_at = datetime.now(UTC)
        db.commit()
        db.refresh(job)
        return job

    job.status = JobStatus.processing
    job.progress = Decimal("50")
    job.started_at = job.started_at or datetime.now(UTC)
    job.attempt = int(job.attempt or 0) + 1
    db.commit()

    wav = _silence_wav_bytes(
        duration_ms=source.duration_ms,
        sample_rate=source.sample_rate or 44100,
        channels=source.channels or 2,
    )
    checksum = hashlib.sha256(wav).hexdigest()

    for idx, name in enumerate(STEMS):
        asset_id = str(uuid4())
        key = f"stems/{job.owner_id}/{job.project_id}/{job.id}/{name}.wav"
        storage.put_bytes(key, wav, "audio/wav")
        asset = AudioAsset(
            id=asset_id,
            owner_id=job.owner_id,
            project_id=job.project_id,
            kind=AssetKind.stem,
            storage_key=key,
            mime_type="audio/wav",
            format="wav",
            checksum_sha256=checksum,
            size_bytes=len(wav),
            duration_ms=source.duration_ms,
            sample_rate=source.sample_rate or 44100,
            channels=source.channels or 2,
            original_filename=f"{name}.wav",
            status=AssetStatus.ready,
        )
        db.add(asset)
        db.flush()
        db.add(
            Stem(
                id=str(uuid4()),
                job_id=job.id,
                project_id=job.project_id,
                owner_id=job.owner_id,
                stem_type=StemType(name),
                asset_id=asset_id,
                order_index=idx,
            )
        )

    minutes = Decimal("0")
    if source.duration_ms:
        minutes = (Decimal(source.duration_ms) / Decimal(60000)).quantize(Decimal("0.0001"))
    usage_id = str(uuid4())
    db.add(
        UsageLedger(
            id=usage_id,
            user_id=job.owner_id,
            job_id=job.id,
            kind=UsageKind.separation_minutes,
            quantity=minutes,
            unit=UsageUnit.minutes,
            period_ym=datetime.now(UTC).strftime("%Y-%m"),
        )
    )
    job.billed_usage_id = usage_id
    job.status = JobStatus.completed
    job.progress = Decimal("100")
    job.model_version = "contract-inline-0.0.1"
    job.finished_at = datetime.now(UTC)
    job.error_code = None
    job.error_message = None
    db.commit()
    db.refresh(job)
    logger.info("inline_contract_completed job_id=%s", job.id)
    return job
