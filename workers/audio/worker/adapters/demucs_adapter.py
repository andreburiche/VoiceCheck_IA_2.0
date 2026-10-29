"""Adapters Demucs (CPU/GPU). Requer pacotes opcionais torch + demucs."""

from __future__ import annotations

import os
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

from worker.adapters.base import SeparationAdapter, SeparationCancelled, SeparationResult

STEMS = ("drums", "bass", "other", "vocals")  # ordem típica demucs htdemucs
CANCEL_POLL_SECONDS = 2.0


def run_cancellable(
    cmd: list[str],
    *,
    timeout: float,
    should_cancel: Callable[[], bool] | None = None,
    poll_seconds: float = CANCEL_POLL_SECONDS,
) -> tuple[int, str]:
    """Executa cmd consultando should_cancel a cada poll_seconds.

    Encerra o processo (terminate → kill) em cancelamento ou timeout.
    Retorna (returncode, saída combinada truncada). stdout/stderr vão para
    um arquivo temporário para o pipe não encher e travar o processo.
    """
    import tempfile

    with tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace") as log:
        proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, text=True)
        deadline = time.monotonic() + timeout
        try:
            while True:
                try:
                    proc.wait(timeout=poll_seconds)
                    break
                except subprocess.TimeoutExpired:
                    pass
                if should_cancel is not None and should_cancel():
                    _stop(proc)
                    raise SeparationCancelled("Cancelado pelo usuário durante a inferência")
                if time.monotonic() > deadline:
                    _stop(proc)
                    raise RuntimeError(f"Demucs excedeu o tempo limite de {int(timeout)}s")
        finally:
            if proc.poll() is None:
                _stop(proc)
        log.seek(0)
        output = log.read()
    return proc.returncode, output[-2000:]


def _stop(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=10)


class DemucsAdapter(SeparationAdapter):
    def __init__(self, *, device: str, name: str) -> None:
        self.device = device
        self.name = name
        self.model = os.getenv("DEMUCS_MODEL", "htdemucs")

    def separate(
        self,
        wav_path: Path,
        work_dir: Path,
        should_cancel: Callable[[], bool] | None = None,
    ) -> SeparationResult:
        try:
            import demucs  # noqa: F401
        except ImportError as exc:
            raise RuntimeError(
                "Demucs/PyTorch não instalados no worker. "
                "Instale com: pip install -r requirements-demucs.txt"
            ) from exc

        out_dir = work_dir / "demucs_out"
        out_dir.mkdir(parents=True, exist_ok=True)
        cmd = [
            "python",
            "-m",
            "demucs",
            "-n",
            self.model,
            "-d",
            self.device,
            "-o",
            str(out_dir),
            str(wav_path),
        ]
        returncode, output = run_cancellable(
            cmd,
            timeout=float(os.getenv("INFERENCE_TIMEOUT_SECONDS", "1800")),
            should_cancel=should_cancel,
        )
        if returncode != 0:
            raise RuntimeError(f"Demucs falhou: {output}")

        # demucs escreve out_dir/<model>/<track_name>/*.wav
        candidates = list(out_dir.rglob("vocals.wav"))
        if not candidates:
            raise RuntimeError("Saída Demucs sem vocals.wav")
        stem_dir = candidates[0].parent
        paths: dict[str, Path] = {}
        for stem in ("vocals", "drums", "bass", "other"):
            p = stem_dir / f"{stem}.wav"
            if not p.is_file():
                raise RuntimeError(f"Stem ausente: {stem}")
            paths[stem] = p
        return SeparationResult(stem_paths=paths, model_version=f"{self.model}", adapter_name=self.name)


class CpuDemucsAdapter(DemucsAdapter):
    def __init__(self) -> None:
        super().__init__(device="cpu", name="cpu_demucs")


class GpuDemucsAdapter(DemucsAdapter):
    def __init__(self) -> None:
        super().__init__(device="cuda", name="gpu_demucs")
