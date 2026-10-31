from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from worker.adapters.base import SeparationCancelled
from worker.adapters.factory import get_separation_adapter
from worker.celery_app import celery_app
from worker.db import get_session
from worker.pipeline.events import publish
from worker.pipeline.ffmpeg_util import decode_to_wav, trim_wav
from worker.pipeline.plano import plano_separacao
from worker.pipeline.qa import validate_stem

STEM_ORDER_4 = ["vocals", "drums", "bass", "other"]
STEM_ORDER_2 = ["vocals", "instrumental"]
TWO_STEM_MODELS = {"htdemucs_two"}



def _is_cancelled(db, job_id: str) -> bool:
    from app.models import ProcessingJob
    from app.models.entities import JobStatus

    job = db.get(ProcessingJob, job_id)
    return bool(job and job.status == JobStatus.cancelled)


def _update(db, job, *, status=None, progress=None, error_code=None, error_message=None):
    from app.models.entities import JobStatus

    if status is not None:
        job.status = status
    if progress is not None:
        job.progress = Decimal(str(progress))
    if error_code is not None:
        job.error_code = error_code
    if error_message is not None:
        job.error_message = error_message
    if status == JobStatus.preparing and job.started_at is None:
        job.started_at = datetime.now(UTC)
    if status in (JobStatus.completed, JobStatus.failed, JobStatus.cancelled):
        job.finished_at = datetime.now(UTC)
    db.commit()
    publish(
        job.id,
        {
            "type": "status",
            "status": job.status.value,
            "progress": float(job.progress),
            "error_code": job.error_code,
            "error_message": job.error_message,
        },
    )


@celery_app.task(name="worker.tasks.separate.run_separation", bind=True, max_retries=2)
def run_separation(self, job_id: str) -> dict:
    from app.models import AudioAsset, ProcessingJob, ProcessingModel, Stem, UsageLedger
    from app.models.entities import AssetKind, AssetStatus, JobStatus, StemType, UsageKind, UsageUnit
    from app.services.storage import get_storage
    from worker.pipeline.stem_mix import build_instrumental

    db = get_session()
    work_root = Path(os.getenv("WORKER_TMP_DIR", "/tmp/estudio-worker")) / job_id
    work_root.mkdir(parents=True, exist_ok=True)

    try:
        job = db.get(ProcessingJob, job_id)
        if not job:
            return {"ok": False, "error": "job_not_found"}
        if job.status == JobStatus.cancelled:
            return {"ok": False, "error": "cancelled"}

        model_row = db.get(ProcessingModel, job.model_id)
        model_code = model_row.code if model_row else "htdemucs"
        two_stem = model_code in TWO_STEM_MODELS

        job.attempt = int(job.attempt or 0) + 1
        _update(db, job, status=JobStatus.preparing, progress=5)

        source = db.get(AudioAsset, job.source_asset_id)
        if not source:
            _update(db, job, status=JobStatus.failed, progress=100, error_code="SOURCE_MISSING", error_message="Asset de origem ausente")
            return {"ok": False}

        storage = get_storage()
        raw_path = work_root / f"source.{source.format}"
        raw_path.write_bytes(storage.get_bytes(source.storage_key))

        if _is_cancelled(db, job_id):
            return {"ok": False, "error": "cancelled"}

        _update(db, job, status=JobStatus.preparing, progress=15)
        wav_path = work_root / "mixture.wav"
        decode_to_wav(raw_path, wav_path)

        # Prévia rápida: corta N segundos do mixture antes da inferência (params.preview_seconds).
        preview_raw = (job.params or {}).get("preview_seconds")
        try:
            preview_sec = float(preview_raw) if preview_raw is not None else 0.0
        except (TypeError, ValueError):
            preview_sec = 0.0
        if preview_sec > 0:
            trimmed = work_root / "mixture_preview.wav"
            trim_wav(wav_path, trimmed, seconds=preview_sec)
            wav_path = trimmed
            publish(
                job.id,
                {
                    "type": "status",
                    "status": JobStatus.preparing.value,
                    "progress": 18,
                    "message": f"Prévia: primeiros {preview_sec:.0f}s",
                },
            )

        expected_duration = source.duration_ms if preview_sec <= 0 else None
        mixture_meta = validate_stem(wav_path, expected_duration_ms=None)
        if expected_duration is None:
            expected_duration = mixture_meta.get("duration_ms")

        if _is_cancelled(db, job_id):
            _update(db, job, status=JobStatus.cancelled, progress=float(job.progress))
            return {"ok": False, "error": "cancelled"}

        _update(db, job, status=JobStatus.processing, progress=35)
        adapter = get_separation_adapter()

        def should_cancel() -> bool:
            # expire_all: sem isso a sessão devolve o job em cache e nunca
            # enxerga o "cancelled" gravado pela API em outra transação.
            db.expire_all()
            return _is_cancelled(db, job_id)

        plano = plano_separacao(model_code, job.params, expected_duration)
        try:
            result = adapter.separate(
                wav_path,
                work_root / "infer",
                should_cancel=should_cancel,
                modelo=plano["modelo"],
                faixas=plano["faixas_adaptador"],
                shifts=plano["shifts"],
                overlap=plano["overlap"],
                timeout_s=plano["timeout_s"],
            )
        except SeparationCancelled:
            job = db.get(ProcessingJob, job_id)
            _update(db, job, status=JobStatus.cancelled, progress=float(job.progress))
            return {"ok": False, "error": "cancelled"}
        except Exception as exc:  # noqa: BLE001
            _update(
                db,
                job,
                status=JobStatus.failed,
                progress=100,
                error_code="INFERENCE_FAILED",
                error_message=str(exc)[:2000],
            )
            return {"ok": False, "error": str(exc)}

        if _is_cancelled(db, job_id):
            _update(db, job, status=JobStatus.cancelled, progress=float(job.progress))
            return {"ok": False, "error": "cancelled"}

        _update(db, job, status=JobStatus.postprocessing, progress=70)

        stem_paths = dict(result.stem_paths)
        if two_stem:
            instr_path = work_root / "infer" / "instrumental.wav"
            build_instrumental(
                stem_paths["drums"],
                stem_paths["bass"],
                stem_paths["other"],
                instr_path,
            )
            stem_paths = {
                "vocals": stem_paths["vocals"],
                "instrumental": instr_path,
            }
            stem_order = list(STEM_ORDER_2)
            model_version = f"{result.model_version}+instrumental-sum"
        else:
            stem_order = list(plano["faixas_finais"])
            model_version = result.model_version

        for idx, stem_name in enumerate(stem_order):
            stem_path = stem_paths.get(stem_name)
            if not stem_path:
                raise RuntimeError(f"Stem ausente no resultado: {stem_name}")
            meta = validate_stem(stem_path, expected_duration_ms=expected_duration)
            data = stem_path.read_bytes()
            checksum = hashlib.sha256(data).hexdigest()
            asset_id = str(uuid4())
            key = f"stems/{job.owner_id}/{job.project_id}/{job.id}/{stem_name}.wav"
            storage.put_bytes(key, data, "audio/wav")

            asset = AudioAsset(
                id=asset_id,
                owner_id=job.owner_id,
                project_id=job.project_id,
                kind=AssetKind.stem,
                storage_key=key,
                mime_type="audio/wav",
                format="wav",
                checksum_sha256=checksum,
                size_bytes=len(data),
                duration_ms=meta.get("duration_ms"),
                sample_rate=meta.get("sample_rate"),
                channels=meta.get("channels"),
                original_filename=f"{stem_name}.wav",
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
                    stem_type=StemType(stem_name),
                    asset_id=asset_id,
                    order_index=idx,
                )
            )
            publish(job.id, {"type": "stem_ready", "stem": stem_name, "progress": 70 + idx * 5})

        # usage_ledger — UNIQUE(job_id) impede cobrança duplicada em retry
        from sqlalchemy import select
        from sqlalchemy.exc import IntegrityError

        minutes = Decimal("0")
        if expected_duration:
            minutes = (Decimal(expected_duration) / Decimal(60000)).quantize(Decimal("0.0001"))
        period = datetime.now(UTC).strftime("%Y-%m")
        existing_usage = db.scalar(select(UsageLedger).where(UsageLedger.job_id == job.id))
        if not existing_usage:
            usage_id = str(uuid4())
            try:
                with db.begin_nested():
                    ledger = UsageLedger(
                        id=usage_id,
                        user_id=job.owner_id,
                        job_id=job.id,
                        kind=UsageKind.separation_minutes,
                        quantity=minutes,
                        unit=UsageUnit.minutes,
                        period_ym=period,
                    )
                    db.add(ledger)
                    db.flush()
                    job.billed_usage_id = usage_id
            except IntegrityError:
                pass

        job.model_version = model_version
        _update(db, job, status=JobStatus.completed, progress=100)
        return {"ok": True, "adapter": result.adapter_name, "stems": stem_order, "model_code": model_code}

    except Exception as exc:  # noqa: BLE001
        try:
            job = db.get(ProcessingJob, job_id)
            if job and job.status not in (JobStatus.cancelled, JobStatus.completed):
                _update(
                    db,
                    job,
                    status=JobStatus.failed,
                    progress=100,
                    error_code="PIPELINE_ERROR",
                    error_message=str(exc)[:2000],
                )
        except Exception:
            pass
        # retry limited by Celery max_retries — only transient? keep failed for now
        raise
    finally:
        db.close()
        shutil.rmtree(work_root, ignore_errors=True)
