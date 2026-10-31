"""Adapters Demucs (CPU/GPU). Requer pacotes opcionais torch + demucs."""

from __future__ import annotations

import os
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

from worker.adapters.base import SeparationAdapter, SeparationCancelled, SeparationResult

STEMS = ("drums", "bass", "other", "vocals")  # ordem típica demucs htdemucs
STEMS_4 = ("vocals", "drums", "bass", "other")
CANCEL_POLL_SECONDS = 2.0
#: Só estes modelos podem ir para a linha de comando (o nome vem do banco/params).
MODELOS_DEMUCS = {"htdemucs", "htdemucs_6s", "htdemucs_ft"}


def comando_demucs(modelo: str, device: str, out_dir: Path, wav_path: Path, *, shifts: int = 0,
                   overlap: float = 0.25) -> list[str]:
    """Linha de comando do Demucs com os controles de qualidade (como no UVR), valores conferidos."""
    if modelo not in MODELOS_DEMUCS:
        raise ValueError(f"Modelo Demucs não permitido: {modelo}")
    shifts = int(shifts)
    overlap = float(overlap)
    if not (0 <= shifts <= 5) or not (0.1 <= overlap <= 0.75):
        raise ValueError("shifts/overlap fora dos limites")
    cmd = ["python", "-m", "demucs", "-n", modelo, "-d", device, "--overlap", f"{overlap:g}"]
    if shifts:
        cmd += ["--shifts", str(shifts)]
    return cmd + ["-o", str(out_dir), str(wav_path)]


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
        *,
        modelo: str | None = None,
        faixas: tuple[str, ...] = STEMS_4,
        shifts: int = 0,
        overlap: float = 0.25,
        timeout_s: float | None = None,
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
        nome_modelo = modelo or self.model
        cmd = comando_demucs(nome_modelo, self.device, out_dir, wav_path, shifts=shifts, overlap=overlap)
        returncode, output = run_cancellable(
            cmd,
            timeout=float(timeout_s or os.getenv("INFERENCE_TIMEOUT_SECONDS", "1800")),
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
        for stem in faixas:
            p = stem_dir / f"{stem}.wav"
            if not p.is_file():
                raise RuntimeError(f"Stem ausente: {stem}")
            paths[stem] = p
        versao = nome_modelo + (f"+shifts{shifts}" if shifts else "") + (f"+overlap{overlap:g}" if overlap != 0.25 else "")
        return SeparationResult(stem_paths=paths, model_version=versao, adapter_name=self.name)


class CpuDemucsAdapter(DemucsAdapter):
    def __init__(self) -> None:
        super().__init__(device="cpu", name="cpu_demucs")


class GpuDemucsAdapter(DemucsAdapter):
    def __init__(self) -> None:
        super().__init__(device="cuda", name="gpu_demucs")
