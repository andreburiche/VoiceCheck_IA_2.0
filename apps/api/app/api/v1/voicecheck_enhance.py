"""VoiceCheck IA — "Aprimorar com IA" (job assíncrono).

A separação da voz (Demucs) roda no worker; sem fila, a API faz o resto
sozinha e avisa que a voz não foi isolada.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, Response

from app.api.v1.voicecheck import _read_limited
from app.core.config import get_settings
from app.core.deps import CurrentUser, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.services.jobs import _celery_client
from app.services.voicecheck_enhance import EnhanceOptions
from app.services.voicecheck_enhance_job import now_iso, read_job, run_enhance_job, update_job
from app.services.voicecheck_media import cleanup_job, job_dir, purge_stale_jobs

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voicecheck/enhance", tags=["voicecheck"])
settings = get_settings()

TASK_NAME = "worker.tasks.voicecheck_enhance.run_enhance"
MAX_OPTIONS_BYTES = 1_000_000


def _root() -> Path:
    return Path(settings.local_storage_path)


def _work(user_id: str, job_id: str) -> Path:
    try:
        work = job_dir(_root(), user_id, job_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job não encontrado") from exc
    meta = read_job(work)
    if meta is None or meta.get("kind") != "enhance":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job não encontrado")
    return work


def _public(job_id: str, meta: dict) -> dict:
    return {
        "job_id": job_id,
        "state": meta.get("state"),
        "stage": meta.get("stage"),
        "progress": meta.get("progress", 0),
        "queue": meta.get("queue"),
        "stats": meta.get("stats"),
        "warnings": meta.get("warnings") or [],
        "error": meta.get("error"),
        "created_at": meta.get("created_at"),
        "updated_at": meta.get("updated_at"),
    }


@router.post("", status_code=status.HTTP_202_ACCEPTED, dependencies=[Depends(verify_csrf)])
async def start_enhance(
    request: Request,
    user: CurrentUser,
    file: UploadFile = File(..., description="WAV PCM 16-bit preparado"),
    options: str = Form("{}"),
) -> JSONResponse:
    enforce_rate_limit(
        request,
        bucket="voicecheck_enhance",
        limit=max(5, settings.rate_limit_upload // 3),
        window_sec=settings.rate_limit_upload_window_sec,
    )
    if len(options) > MAX_OPTIONS_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Opções grandes demais")
    try:
        opts_raw = json.loads(options or "{}")
        if not isinstance(opts_raw, dict):
            raise ValueError
        opts = EnhanceOptions.from_dict(opts_raw)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Opções inválidas") from exc

    raw = await _read_limited(file)
    if not raw or raw[:4] != b"RIFF":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo inválido — envie o WAV preparado (RIFF/WAVE)",
        )

    try:
        purge_stale_jobs(_root(), user.id, max_age_hours=settings.voicecheck_job_ttl_hours)
    except (OSError, ValueError):
        logger.warning("VoiceCheck: limpeza de jobs antigos falhou", exc_info=True)

    job_id = str(uuid4())
    work = job_dir(_root(), user.id, job_id)
    work.mkdir(parents=True, exist_ok=True)
    (work / "input.wav").write_bytes(raw)
    # Guarda as opções já validadas (o worker relê com o mesmo parser)
    (work / "options.json").write_text(json.dumps(opts_raw, ensure_ascii=False), encoding="utf-8")
    update_job(
        work,
        kind="enhance",
        user_id=user.id,
        state="queued",
        stage="Na fila",
        progress=0,
        created_at=now_iso(),
    )

    queue = "api"
    if opts.isolate:  # sem separação não precisa do worker (modo "isolate" sempre precisa)
        update_job(work, queue="worker")
        try:
            _celery_client().send_task(TASK_NAME, args=[str(work)])
            queue = "worker"
        except Exception as exc:  # noqa: BLE001 — fila fora do ar
            logger.warning("VoiceCheck enhance: fila indisponível, rodando na API: %s", exc)
    if queue == "api":
        update_job(work, queue="api")
        threading.Thread(target=run_enhance_job, args=(work, None), daemon=True).start()
    return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=_public(job_id, read_job(work) or {}))


@router.get("/{job_id}")
def enhance_status(job_id: str, user: CurrentUser) -> dict:
    work = _work(user.id, job_id)
    return _public(job_id, read_job(work) or {})


@router.get("/{job_id}/audio")
def enhance_audio(job_id: str, user: CurrentUser) -> Response:
    work = _work(user.id, job_id)
    out = work / "output.wav"
    if (read_job(work) or {}).get("state") != "done" or not out.is_file():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O áudio ainda não está pronto")
    return FileResponse(out, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(verify_csrf)])
def enhance_delete(job_id: str, user: CurrentUser) -> Response:
    work = _work(user.id, job_id)
    cleanup_job(work)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
