from __future__ import annotations

import subprocess
from pathlib import Path


def decode_to_wav(source: Path, dest: Path, *, sample_rate: int = 44100) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-ac",
        "2",
        "-ar",
        str(sample_rate),
        "-sample_fmt",
        "s16",
        str(dest),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0 or not dest.is_file():
        raise RuntimeError(f"FFmpeg decode falhou: {result.stderr[-1500:]}")
    return dest


def trim_wav(source: Path, dest: Path, *, seconds: float) -> Path:
    """Corta o início do WAV (prévia rápida). seconds deve ser > 0."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    dur = max(0.5, min(float(seconds), 120.0))
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-t",
        str(dur),
        "-ac",
        "2",
        "-ar",
        "44100",
        "-sample_fmt",
        "s16",
        str(dest),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0 or not dest.is_file():
        raise RuntimeError(f"FFmpeg trim falhou: {result.stderr[-1500:]}")
    return dest
