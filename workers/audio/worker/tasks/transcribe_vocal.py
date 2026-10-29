"""Job Celery: áudio → notas → preenche VocalTranscription."""

from __future__ import annotations

import os
import shutil
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from worker.celery_app import celery_app
from worker.db import get_session
from worker.pipeline.ffmpeg_util import decode_to_wav
from worker.pipeline.pitch_basic import transcribe_wav


@celery_app.task(name="worker.tasks.transcribe_vocal.run_transcription", bind=True, max_retries=1)
def run_transcription(self, transcription_id: str) -> dict:
    from app.models.entities import (
        AudioAsset,
        ScoreVersion,
        TranscriptionNote,
        VocalPart,
        VocalTranscription,
        VocalTranscriptionStatus,
        VocalVoiceRole,
    )
    from app.services.storage import get_storage

    db = get_session()
    work_root = Path(os.getenv("WORKER_TMP_DIR", "/tmp/estudio-worker")) / f"vocal-{transcription_id}"
    work_root.mkdir(parents=True, exist_ok=True)

    try:
        tx = db.get(VocalTranscription, transcription_id)
        if not tx:
            return {"ok": False, "error": "not_found"}

        meta = dict(tx.meta or {})
        meta["worker_state"] = "running"
        tx.meta = meta
        db.commit()

        source = db.get(AudioAsset, tx.source_asset_id)
        if not source:
            tx.status = VocalTranscriptionStatus.failed
            meta["worker_state"] = "failed"
            meta["error"] = "SOURCE_MISSING"
            tx.meta = meta
            db.commit()
            return {"ok": False, "error": "source_missing"}

        storage = get_storage()
        raw_path = work_root / f"source.{source.format or 'bin'}"
        raw_path.write_bytes(storage.get_bytes(source.storage_key))
        wav_path = work_root / "voice.wav"
        decode_to_wav(raw_path, wav_path, sample_rate=22050)

        notes, engine, pitch_meta = transcribe_wav(wav_path)
        if not notes:
            tx.status = VocalTranscriptionStatus.failed
            tx.engine = engine
            meta.update(pitch_meta)
            meta["worker_state"] = "failed"
            meta["error"] = "NO_NOTES"
            tx.meta = meta
            db.commit()
            return {"ok": False, "error": "no_notes"}

        # Limpa partes anteriores (job cria rascunho vazio ou reprocessa)
        for p in list(tx.parts):
            db.delete(p)
        db.flush()

        part = VocalPart(
            id=str(uuid4()),
            transcription_id=tx.id,
            label=str(meta.get("part_label") or "Voz principal"),
            voice_role=VocalVoiceRole(meta.get("voice_role") or "principal"),
            needs_review=True,
            order_index=0,
            audio_asset_id=tx.source_asset_id,
        )
        db.add(part)
        db.flush()
        for n in notes:
            if n["end_ms"] < n["start_ms"]:
                continue
            db.add(
                TranscriptionNote(
                    id=str(uuid4()),
                    part_id=part.id,
                    pitch_midi=int(n["pitch_midi"]),
                    start_ms=int(n["start_ms"]),
                    end_ms=int(n["end_ms"]),
                    velocity=int(n.get("velocity") or 80),
                )
            )

        conf = float(pitch_meta.get("confidence_est") or 0.5)
        tx.engine = engine
        tx.confidence = Decimal(str(round(conf, 4)))
        tx.polyphony_warning = True
        tx.status = VocalTranscriptionStatus.needs_review
        meta.update(pitch_meta)
        meta["worker_state"] = "done"
        meta["disclaimer"] = (
            "Transcrição worker monofônica; coral/SATB exige revisão manual (ADR-016/020)."
        )
        tx.meta = meta

        db.add(
            ScoreVersion(
                id=str(uuid4()),
                transcription_id=tx.id,
                version=1,
                musicxml=None,
                snapshot_json={"engine": engine, "notes": notes[:50], "note_count": len(notes)},
                label=f"Worker {engine}",
            )
        )
        db.commit()
        return {"ok": True, "engine": engine, "notes": len(notes)}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        tx = db.get(VocalTranscription, transcription_id)
        if tx:
            meta = dict(tx.meta or {})
            meta["worker_state"] = "failed"
            meta["error"] = str(exc)[:500]
            tx.meta = meta
            tx.status = VocalTranscriptionStatus.failed
            db.commit()
        raise
    finally:
        shutil.rmtree(work_root, ignore_errors=True)
        db.close()
