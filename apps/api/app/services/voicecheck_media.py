"""VoiceCheck — probe ffprobe + extração de áudio via FFmpeg (local, paths controlados)."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import time
import wave
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

SAFE_JOB_ID = re.compile(r"^[a-f0-9-]{36}$", re.I)
ALLOWED_EXT = {".mp3", ".wav", ".flac", ".m4a", ".mp4", ".mov"}


@dataclass
class VoiceCheckProbe:
    duration_ms: int | None
    sample_rate: int | None
    channels: int | None
    has_audio: bool
    has_video: bool
    format_name: str | None
    audio_codec: str | None
    video_codec: str | None
    ffprobe_ok: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def assert_safe_job_id(job_id: str) -> str:
    if not SAFE_JOB_ID.match(job_id):
        raise ValueError("job_id inválido")
    return job_id


def assert_allowed_filename(filename: str) -> str:
    raw = filename.strip()
    if not raw or "/" in raw or "\\" in raw or ".." in raw:
        raise ValueError("Nome de arquivo inválido")
    name = Path(raw).name
    if not name or name in {".", ".."}:
        raise ValueError("Nome de arquivo inválido")
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise ValueError(f"Extensão não permitida: {ext or '(vazia)'}")
    return name


def voicecheck_root(storage_root: Path, user_id: str) -> Path:
    """Raiz por usuário — impede path traversal."""
    uid = Path(user_id).name
    if not uid or uid in {".", ".."}:
        raise ValueError("user_id inválido")
    root = (storage_root / "voicecheck" / uid).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def job_dir(storage_root: Path, user_id: str, job_id: str) -> Path:
    jid = assert_safe_job_id(job_id)
    base = voicecheck_root(storage_root, user_id)
    path = (base / jid).resolve()
    if not str(path).startswith(str(base)):
        raise ValueError("Caminho inseguro")
    return path


def probe_media(path: Path) -> VoiceCheckProbe:
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
            timeout=90,
            check=False,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return VoiceCheckProbe(
            duration_ms=None,
            sample_rate=None,
            channels=None,
            has_audio=False,
            has_video=False,
            format_name=None,
            audio_codec=None,
            video_codec=None,
            ffprobe_ok=False,
        )

    if result.returncode != 0 or not result.stdout:
        return VoiceCheckProbe(
            duration_ms=None,
            sample_rate=None,
            channels=None,
            has_audio=False,
            has_video=False,
            format_name=None,
            audio_codec=None,
            video_codec=None,
            ffprobe_ok=False,
        )

    data = json.loads(result.stdout)
    fmt = data.get("format") or {}
    duration_ms: int | None = None
    if fmt.get("duration"):
        duration_ms = int(float(fmt["duration"]) * 1000)

    has_audio = False
    has_video = False
    sample_rate: int | None = None
    channels: int | None = None
    audio_codec: str | None = None
    video_codec: str | None = None

    for stream in data.get("streams") or []:
        ctype = stream.get("codec_type")
        if ctype == "audio":
            has_audio = True
            audio_codec = stream.get("codec_name")
            if stream.get("sample_rate"):
                sample_rate = int(stream["sample_rate"])
            if stream.get("channels"):
                channels = int(stream["channels"])
        elif ctype == "video":
            # ignore cover art stills sometimes tagged as video with low nb_frames
            has_video = True
            video_codec = stream.get("codec_name")

    format_name = fmt.get("format_name")
    if isinstance(format_name, str):
        format_name = format_name.split(",")[0]
    else:
        format_name = None

    return VoiceCheckProbe(
        duration_ms=duration_ms,
        sample_rate=sample_rate,
        channels=channels,
        has_audio=has_audio,
        has_video=has_video,
        format_name=format_name,
        audio_codec=audio_codec,
        video_codec=video_codec,
        ffprobe_ok=True,
    )


def extract_audio_wav(source: Path, dest: Path, *, sample_rate: int = 44100) -> Path:
    """Extrai faixa de áudio para WAV PCM 16-bit. Não altera o arquivo original do usuário."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-sample_fmt",
        "s16",
        str(dest),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    except FileNotFoundError as exc:
        raise RuntimeError("FFmpeg não encontrado no PATH do servidor") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("FFmpeg excedeu o tempo limite") from exc

    if result.returncode != 0 or not dest.is_file():
        raise RuntimeError(f"FFmpeg falhou ao extrair áudio: {(result.stderr or '')[-1200:]}")
    return dest


def wav_info(path: Path) -> tuple[int, int, int]:
    """duration_ms, sample_rate, channels."""
    with wave.open(str(path), "rb") as wf:
        sr = wf.getframerate()
        ch = wf.getnchannels()
        n = wf.getnframes()
        duration_ms = int(n * 1000 / sr) if sr else 0
        return duration_ms, sr, ch


def write_meta(dir_path: Path, meta: dict[str, Any]) -> None:
    (dir_path / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def read_meta(dir_path: Path) -> dict[str, Any] | None:
    p = dir_path / "meta.json"
    if not p.is_file():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def cleanup_job(dir_path: Path) -> None:
    if dir_path.is_dir():
        shutil.rmtree(dir_path, ignore_errors=True)


def purge_stale_jobs(storage_root: Path, user_id: str, *, max_age_hours: float) -> int:
    """Apaga jobs do usuário mais antigos que max_age_hours.

    O front baixa o WAV preparado e apaga o job logo em seguida; o que sobra
    aqui são jobs abandonados (aba fechada, erro no meio do fluxo), que de
    outra forma ficariam no disco para sempre. Retorna quantos foram apagados.
    """
    if max_age_hours <= 0:
        return 0
    base = voicecheck_root(storage_root, user_id)
    cutoff = time.time() - max_age_hours * 3600
    removed = 0
    for child in base.iterdir():
        if not child.is_dir() or not SAFE_JOB_ID.match(child.name):
            continue
        # Só pastas de job (têm meta.json). Diagnósticos salvos pelo usuário
        # antigos também moram aqui e nunca podem expirar.
        if not (child / "meta.json").is_file():
            continue
        try:
            if child.stat().st_mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
                removed += 1
        except OSError:
            continue
    return removed
