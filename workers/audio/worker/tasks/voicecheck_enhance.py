"""Job Celery: VoiceCheck "Aprimorar com IA" — separa a voz (Demucs) e aprimora."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from worker.adapters.demucs_adapter import run_cancellable
from worker.celery_app import celery_app

STORAGE_ROOT = Path(os.getenv("LOCAL_STORAGE_PATH", "/data/audio")).resolve()


def _isolate(wav_path: Path, work: Path) -> Path:
    """Demucs (2 stems: voz / resto) → WAV mono 44,1 kHz 16-bit só da voz."""
    try:
        import demucs  # noqa: F401
    except ImportError as exc:
        raise RuntimeError("Demucs não está instalado no worker") from exc

    out_dir = work / "demucs_out"
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        "python",
        "-m",
        "demucs",
        "-n",
        os.getenv("DEMUCS_MODEL", "htdemucs"),
        "-d",
        os.getenv("DEMUCS_DEVICE", "cpu"),
        "--two-stems",
        "vocals",
        "-o",
        str(out_dir),
        str(wav_path),
    ]
    code, output = run_cancellable(
        cmd,
        timeout=float(os.getenv("INFERENCE_TIMEOUT_SECONDS", "1800")),
        # Usuário apagou o job → para a inferência
        should_cancel=lambda: not (work / "meta.json").is_file(),
    )
    if code != 0:
        raise RuntimeError(f"Demucs falhou: {output[-300:]}")
    found = list(out_dir.rglob("vocals.wav"))
    if not found:
        raise RuntimeError("Demucs não gerou a faixa de voz")
    mono = work / "vocals_mono.wav"
    conv = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(found[0]), "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", str(mono)],
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    if conv.returncode != 0:
        raise RuntimeError(f"Conversão da voz falhou: {conv.stderr[-200:]}")
    return mono


@celery_app.task(name="worker.tasks.voicecheck_enhance.run_enhance")
def run_enhance(work_dir: str) -> dict:
    from app.services.voicecheck_enhance_job import run_enhance_job

    work = Path(work_dir).resolve()
    if not str(work).startswith(str(STORAGE_ROOT / "voicecheck")):
        return {"ok": False, "error": "caminho inválido"}
    run_enhance_job(work, isolate_fn=_isolate)
    return {"ok": True}
