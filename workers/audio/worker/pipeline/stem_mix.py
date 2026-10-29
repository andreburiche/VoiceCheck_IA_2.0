"""Utilitários de mixagem de stems (pós-Demucs)."""

from __future__ import annotations

import subprocess
from pathlib import Path


def build_instrumental(
    drums: Path,
    bass: Path,
    other: Path,
    dest: Path,
) -> Path:
    """Soma drums+bass+other → instrumental (2ª faixa vocal/instrumental).

    Usa amix do FFmpeg (já presente no worker). Não é um modelo Demucs two
    separado: reutiliza o htdemucs MIT com pós-processamento explícito.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    for p in (drums, bass, other):
        if not p.is_file():
            raise RuntimeError(f"Stem ausente para instrumental: {p.name}")

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(drums),
        "-i",
        str(bass),
        "-i",
        str(other),
        "-filter_complex",
        "[0:a][1:a][2:a]amix=inputs=3:duration=longest:normalize=0[out]",
        "-map",
        "[out]",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-sample_fmt",
        "s16",
        str(dest),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0 or not dest.is_file():
        raise RuntimeError(f"Falha ao gerar instrumental: {result.stderr[-1500:]}")
    return dest


def encode_mp3(wav_path: Path, mp3_path: Path, *, bitrate: str = "192k") -> Path:
    """Encode WAV → MP3 via libmp3lame (requer ffmpeg com lame)."""
    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(wav_path),
        "-codec:a",
        "libmp3lame",
        "-b:a",
        bitrate,
        str(mp3_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0 or not mp3_path.is_file():
        raise RuntimeError(
            "Encode MP3 falhou (ffmpeg/libmp3lame). "
            f"{result.stderr[-1500:] or result.stdout[-1500:]}"
        )
    return mp3_path
