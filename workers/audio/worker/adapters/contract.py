"""Adapter de contrato — NÃO é separação real.

Com ALLOW_CONTRACT_STEMS=1 (dev/smoke):
- `other` recebe uma cópia do mixture (áudio audível, duração correta)
- vocals/drums/bass ficam em silêncio com o mesmo comprimento

Assim o estúdio tem som e timeline alinhada sem Demucs.
Nunca use em production.
"""

from __future__ import annotations

import os
import shutil
import struct
import wave
from collections.abc import Callable
from pathlib import Path

from worker.adapters.base import SeparationAdapter, SeparationResult

STEMS = ("vocals", "drums", "bass", "other")


def _write_silence_wav(path: Path, *, frames: int, sample_rate: int = 44100, channels: int = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        silence = struct.pack("<h", 0) * channels
        for _ in range(frames):
            wf.writeframesraw(silence)


def _read_wav_frames(path: Path) -> tuple[int, int, int]:
    with wave.open(str(path), "r") as wf:
        return wf.getnframes(), wf.getframerate(), wf.getnchannels()


class ContractNoopAdapter(SeparationAdapter):
    name = "contract"

    def separate(
        self,
        wav_path: Path,
        work_dir: Path,
        should_cancel: Callable[[], bool] | None = None,
        *,
        modelo: str = "htdemucs",
        faixas: tuple[str, ...] = STEMS,
        shifts: int = 0,
        overlap: float = 0.25,
        timeout_s: float | None = None,
    ) -> SeparationResult:
        allow = os.getenv("ALLOW_CONTRACT_STEMS", "").lower() in {"1", "true", "yes"}
        env = os.getenv("APP_ENV", "development").lower()
        if env == "production" or not allow:
            raise RuntimeError(
                "SEPARATION_ADAPTER=contract não executa inferência real. "
                "Configure cpu_demucs ou gpu_demucs e instale Demucs/PyTorch. "
                "Para testes de pipeline: ALLOW_CONTRACT_STEMS=1."
            )

        frames, sr, ch = _read_wav_frames(wav_path)
        work_dir.mkdir(parents=True, exist_ok=True)
        out: dict[str, Path] = {}

        for stem in faixas:
            p = work_dir / f"{stem}.wav"
            if stem == "other":
                # Passthrough audível do mixture (smoke).
                shutil.copyfile(wav_path, p)
            else:
                _write_silence_wav(p, frames=frames, sample_rate=sr, channels=ch)
            out[stem] = p

        return SeparationResult(
            stem_paths=out,
            model_version="contract-passthrough-0.1.0",
            adapter_name=self.name,
        )
