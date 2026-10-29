from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy import select

from worker.celery_app import celery_app
from worker.db import get_session
from worker.pipeline.stem_mix import encode_mp3

STEM_EXPORT_ORDER = ["vocals", "drums", "bass", "other", "instrumental"]


@celery_app.task(name="worker.tasks.export.run_export", bind=True, max_retries=1)
def run_export(self, job_id: str) -> dict:
    from app.models import AudioAsset, ExportJob, MixPreset, Stem
    from app.models.entities import AssetKind, AssetStatus, ExportKind, ExportStatus
    from app.services.storage import get_storage

    db = get_session()
    work = Path(os.getenv("WORKER_TMP_DIR", "/tmp/estudio-worker")) / f"export-{job_id}"
    work.mkdir(parents=True, exist_ok=True)

    try:
        job = db.get(ExportJob, job_id)
        if not job:
            return {"ok": False, "error": "missing"}
        job.status = ExportStatus.processing
        db.commit()

        params = job.params or {}
        out_format = str(params.get("format") or "wav").lower()
        if out_format not in {"wav", "mp3"}:
            out_format = "wav"
        bitrate = str(params.get("bitrate") or "192k")

        storage = get_storage()
        stems = list(
            db.scalars(select(Stem).where(Stem.project_id == job.project_id, Stem.owner_id == job.owner_id)).all()
        )
        job_filter = params.get("job_id")
        if job_filter:
            stems = [s for s in stems if s.job_id == job_filter]
        if not stems:
            raise RuntimeError("Nenhum stem disponível")

        by_type: dict[str, Stem] = {}
        for s in sorted(stems, key=lambda x: x.created_at, reverse=True):
            key_name = s.stem_type.value
            if key_name not in by_type:
                by_type[key_name] = s

        local_paths: dict[str, Path] = {}
        for name, stem in by_type.items():
            asset = db.get(AudioAsset, stem.asset_id)
            if not asset:
                continue
            p = work / f"{name}.wav"
            p.write_bytes(storage.get_bytes(asset.storage_key))
            local_paths[name] = p

        if not local_paths:
            raise RuntimeError("Falha ao baixar stems")

        if job.kind == ExportKind.stem:
            stem_name = params.get("stem_type", "vocals")
            if stem_name not in local_paths:
                raise RuntimeError(f"Stem {stem_name} ausente")
            wav_path = local_paths[stem_name]
            if out_format == "mp3":
                result_path = work / f"{stem_name}.mp3"
                encode_mp3(wav_path, result_path, bitrate=bitrate)
                filename = f"{stem_name}.mp3"
                mime, fmt = "audio/mpeg", "mp3"
            else:
                result_path = wav_path
                filename = f"{stem_name}.wav"
                mime, fmt = "audio/wav", "wav"

        elif job.kind == ExportKind.stems_zip:
            result_path = work / "stems.zip"
            with ZipFile(result_path, "w", compression=ZIP_DEFLATED) as zf:
                for name in STEM_EXPORT_ORDER:
                    if name not in local_paths:
                        continue
                    path = local_paths[name]
                    if out_format == "mp3":
                        mp3_path = work / f"{name}.mp3"
                        encode_mp3(path, mp3_path, bitrate=bitrate)
                        zf.write(mp3_path, arcname=f"{name}.mp3")
                    else:
                        zf.write(path, arcname=f"{name}.wav")
                # stems fora da ordem conhecida
                for name, path in local_paths.items():
                    if name in STEM_EXPORT_ORDER:
                        continue
                    if out_format == "mp3":
                        mp3_path = work / f"{name}.mp3"
                        encode_mp3(path, mp3_path, bitrate=bitrate)
                        zf.write(mp3_path, arcname=f"{name}.mp3")
                    else:
                        zf.write(path, arcname=f"{name}.wav")
            filename = "stems.zip"
            mime, fmt = "application/zip", "zip"

        elif job.kind == ExportKind.mixdown:
            preset = db.scalar(
                select(MixPreset).where(
                    MixPreset.project_id == job.project_id,
                    MixPreset.owner_id == job.owner_id,
                    MixPreset.is_default.is_(True),
                )
            )
            state = (preset.state if preset else {}) or {}
            stem_states = state.get("stems") or {}
            master = float(state.get("master_gain", 1.0))

            ordered = [n for n in STEM_EXPORT_ORDER if n in local_paths]
            for name in local_paths:
                if name not in ordered:
                    ordered.append(name)

            active: list[tuple[str, Path, float, bool]] = []
            for name in ordered:
                st = stem_states.get(name) or {}
                if st.get("mute"):
                    continue
                vol = float(st.get("volume", 1.0)) * master
                active.append((name, local_paths[name], vol, bool(st.get("solo"))))

            if any(s for _, _, _, s in active):
                active = [a for a in active if a[3]]

            wav_out = work / "mixdown.wav"
            if not active:
                proc = subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-f",
                        "lavfi",
                        "-i",
                        "anullsrc=r=44100:cl=stereo",
                        "-t",
                        "1",
                        str(wav_out),
                    ],
                    capture_output=True,
                    text=True,
                )
                if proc.returncode != 0:
                    raise RuntimeError(proc.stderr[-1500:])
            else:
                cmd: list[str] = ["ffmpeg", "-y"]
                for _, path, _, _ in active:
                    cmd.extend(["-i", str(path)])
                filter_parts = [f"[{i}:a]volume={vol}[a{i}]" for i, (_, _, vol, _) in enumerate(active)]
                mix_ins = "".join(f"[a{i}]" for i in range(len(active)))
                filter_parts.append(f"{mix_ins}amix=inputs={len(active)}:duration=longest:normalize=0[out]")
                cmd.extend(["-filter_complex", ";".join(filter_parts), "-map", "[out]", str(wav_out)])
                proc = subprocess.run(cmd, capture_output=True, text=True)
                if proc.returncode != 0:
                    raise RuntimeError(proc.stderr[-1500:])

            if out_format == "mp3":
                result_path = work / "mixdown.mp3"
                encode_mp3(wav_out, result_path, bitrate=bitrate)
                filename = "mixdown.mp3"
                mime, fmt = "audio/mpeg", "mp3"
            else:
                result_path = wav_out
                filename = "mixdown.wav"
                mime, fmt = "audio/wav", "wav"
        else:
            raise RuntimeError("kind não suportado")

        data = result_path.read_bytes()
        checksum = hashlib.sha256(data).hexdigest()
        asset_id = str(uuid4())
        storage_key = f"exports/{job.owner_id}/{job.project_id}/{job.id}/{filename}"
        storage.put_bytes(storage_key, data, mime)
        asset = AudioAsset(
            id=asset_id,
            owner_id=job.owner_id,
            project_id=job.project_id,
            kind=AssetKind.export,
            storage_key=storage_key,
            mime_type=mime,
            format=fmt,
            checksum_sha256=checksum,
            size_bytes=len(data),
            original_filename=filename,
            status=AssetStatus.ready,
        )
        db.add(asset)
        job.result_asset_id = asset_id
        job.status = ExportStatus.completed
        job.finished_at = datetime.now(UTC)
        db.commit()
        return {"ok": True, "asset_id": asset_id, "format": fmt}

    except Exception as exc:  # noqa: BLE001
        try:
            job = db.get(ExportJob, job_id)
            if job:
                job.status = ExportStatus.failed
                job.error_message = str(exc)[:2000]
                job.finished_at = datetime.now(UTC)
                db.commit()
        except Exception:
            pass
        raise
    finally:
        db.close()
        shutil.rmtree(work, ignore_errors=True)
