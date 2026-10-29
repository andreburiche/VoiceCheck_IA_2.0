from __future__ import annotations

import json
import subprocess
import wave
from pathlib import Path


def probe(path: Path) -> dict:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe falhou em {path.name}")
    return json.loads(result.stdout)


def validate_stem(path: Path, *, expected_duration_ms: int | None, tolerance_ms: int = 250) -> dict:
    if not path.is_file() or path.stat().st_size < 44:
        raise RuntimeError(f"Stem inválido ou vazio: {path}")

    info = probe(path)
    duration_ms = None
    if info.get("format", {}).get("duration"):
        duration_ms = int(float(info["format"]["duration"]) * 1000)

    sample_rate = None
    channels = None
    for stream in info.get("streams") or []:
        if stream.get("codec_type") == "audio":
            sample_rate = int(stream.get("sample_rate") or 0) or None
            channels = int(stream.get("channels") or 0) or None
            break

    if expected_duration_ms is not None and duration_ms is not None:
        if abs(duration_ms - expected_duration_ms) > tolerance_ms:
            raise RuntimeError(
                f"Dessincronia em {path.name}: {duration_ms}ms vs esperado {expected_duration_ms}ms"
            )

    # WAV header sanity (NaN/clipping profundo fica para fase posterior)
    if path.suffix.lower() == ".wav":
        with wave.open(str(path), "r") as wf:
            if wf.getnframes() <= 0:
                raise RuntimeError(f"Stem sem frames: {path.name}")

    return {"duration_ms": duration_ms, "sample_rate": sample_rate, "channels": channels}
