"""Validação de mídia: assinatura MIME, tamanho e duração (ffprobe)."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".mp4", ".m4a"}

# MIME declarados aceitos (cliente) → formato canônico
ALLOWED_MIME_TO_FORMAT: dict[str, str] = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "video/mp4": "mp4",
    "audio/mp4": "mp4",
    "audio/x-m4a": "mp4",
}

# MIME detectado por assinatura → formato
DETECTED_MIME_TO_FORMAT: dict[str, str] = {
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/flac": "flac",
    "video/mp4": "mp4",
}


@dataclass
class MediaProbe:
    mime_type: str
    format: str
    duration_ms: int | None
    sample_rate: int | None
    channels: int | None


def sniff_mime(header: bytes) -> str | None:
    if len(header) < 12:
        return None
    if header.startswith(b"ID3") or header[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return "audio/mpeg"
    if header.startswith(b"RIFF") and header[8:12] == b"WAVE":
        return "audio/wav"
    if header.startswith(b"fLaC"):
        return "audio/flac"
    if header[4:8] == b"ftyp":
        return "video/mp4"
    return None


def normalize_declared_mime(mime: str) -> str:
    return mime.split(";")[0].strip().lower()


def resolve_format(declared_mime: str, detected_mime: str | None, filename: str | None) -> tuple[str, str]:
    """Retorna (mime_canonical, format). Levanta ValueError se inválido."""
    declared = normalize_declared_mime(declared_mime)
    if declared not in ALLOWED_MIME_TO_FORMAT:
        raise ValueError(f"MIME não suportado: {declared}")

    if detected_mime is None:
        raise ValueError("Não foi possível detectar o tipo real do arquivo")

    declared_fmt = ALLOWED_MIME_TO_FORMAT[declared]
    detected_fmt = DETECTED_MIME_TO_FORMAT.get(detected_mime)
    if detected_fmt is None:
        raise ValueError(f"Assinatura de arquivo não reconhecida: {detected_mime}")

    # MP3 declarado vs MPEG ok; MP4 audio/video ok
    if declared_fmt != detected_fmt:
        raise ValueError(
            f"MIME declarado ({declared}) não corresponde ao conteúdo ({detected_mime})"
        )

    if filename:
        ext = Path(filename).suffix.lower()
        if ext and ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Extensão não permitida: {ext}")

    canonical_mime = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "flac": "audio/flac",
        "mp4": "video/mp4",
    }[detected_fmt]
    return canonical_mime, detected_fmt


def probe_with_ffprobe(path: Path) -> tuple[int | None, int | None, int | None]:
    """Retorna (duration_ms, sample_rate, channels) ou Nones se ffprobe indisponível."""
    try:
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
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None, None, None

    if result.returncode != 0 or not result.stdout:
        return None, None, None

    data = json.loads(result.stdout)
    duration_ms: int | None = None
    fmt = data.get("format") or {}
    if fmt.get("duration"):
        duration_ms = int(float(fmt["duration"]) * 1000)

    sample_rate: int | None = None
    channels: int | None = None
    for stream in data.get("streams") or []:
        if stream.get("codec_type") == "audio":
            if stream.get("sample_rate"):
                sample_rate = int(stream["sample_rate"])
            if stream.get("channels"):
                channels = int(stream["channels"])
            break

    return duration_ms, sample_rate, channels
