"""Testes do pós-processamento 2-stem e encode MP3 (requer ffmpeg)."""

from __future__ import annotations

import shutil
import struct
import subprocess
import wave
from pathlib import Path

import pytest

from worker.pipeline.stem_mix import build_instrumental, encode_mp3


def _write_tone_wav(path: Path, *, frames: int = 8000, sample_rate: int = 44100, amp: int = 1000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        for i in range(frames):
            sample = struct.pack("<hh", amp if i % 2 == 0 else -amp, amp if i % 3 == 0 else -amp)
            wf.writeframesraw(sample)


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg ausente")
def test_build_instrumental(tmp_path: Path) -> None:
    drums = tmp_path / "drums.wav"
    bass = tmp_path / "bass.wav"
    other = tmp_path / "other.wav"
    _write_tone_wav(drums, amp=500)
    _write_tone_wav(bass, amp=700)
    _write_tone_wav(other, amp=900)
    out = tmp_path / "instrumental.wav"
    build_instrumental(drums, bass, other, out)
    assert out.is_file()
    assert out.stat().st_size > 1000


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg ausente")
def test_encode_mp3(tmp_path: Path) -> None:
    wav = tmp_path / "tone.wav"
    _write_tone_wav(wav)
    mp3 = tmp_path / "tone.mp3"
    try:
        encode_mp3(wav, mp3, bitrate="128k")
    except RuntimeError as exc:
        if "libmp3lame" in str(exc).lower() or "unknown encoder" in str(exc).lower():
            pytest.skip("ffmpeg sem libmp3lame")
        raise
    assert mp3.is_file()
    assert mp3.stat().st_size > 100
    # smoke: ffprobe se existir
    if shutil.which("ffprobe"):
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=format_name", "-of", "csv=p=0", str(mp3)],
            capture_output=True,
            text=True,
        )
        assert proc.returncode == 0
        assert "mp3" in (proc.stdout or "").lower()
