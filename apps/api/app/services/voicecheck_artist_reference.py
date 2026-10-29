"""
VoiceCheck — música original do artista.

Pipeline local: FFmpeg → (Demucs vocals se disponível) → F0 → notas.
Sem APIs externas. Se a separação falhar ou for fraca, usa a mistura com aviso.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.services.voicecheck_audio_reference import (
    ensure_ref_wav_bytes,
    parse_audio_reference_bytes,
)
from app.services.voicecheck_pitch import YinParams
from app.services.voicecheck_reference import NormalizedReference

logger = logging.getLogger(__name__)

DEMUCS_TIMEOUT = int(os.getenv("VOICECHECK_DEMUCS_TIMEOUT", "900"))


@dataclass
class ArtistReferenceResult:
    reference: NormalizedReference
    quality: str  # vocals_stem | mixture | mixture_low_confidence
    isolation_status: str  # ok | skipped | failed | unavailable
    selected_vocal_part: str
    warnings: list[str]
    meta: dict[str, Any]

    def to_meta_dict(self) -> dict[str, Any]:
        return {
            "reference_quality": self.quality,
            "isolation_status": self.isolation_status,
            "selected_vocal_part": self.selected_vocal_part,
            **self.meta,
        }


def _demucs_available() -> bool:
    try:
        import demucs  # noqa: F401

        return True
    except ImportError:
        return shutil.which("demucs") is not None


def _run_demucs_vocals(wav_path: Path, work: Path) -> Path:
    out_dir = work / "demucs_out"
    out_dir.mkdir(parents=True, exist_ok=True)
    model = os.getenv("DEMUCS_MODEL", "htdemucs")
    device = os.getenv("DEMUCS_DEVICE", "cpu")
    cmd = [
        "python",
        "-m",
        "demucs",
        "-n",
        model,
        "-d",
        device,
        "--two-stems",
        "vocals",
        "-o",
        str(out_dir),
        str(wav_path),
    ]
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=DEMUCS_TIMEOUT,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            (result.stderr or result.stdout or "Demucs falhou")[-2000:]
        )
    candidates = list(out_dir.rglob("vocals.wav"))
    if not candidates:
        raise RuntimeError("Demucs sem vocals.wav na saída")
    return candidates[0]


def isolate_artist_vocals(
    data: bytes,
    *,
    filename: str = "artist.mp3",
) -> tuple[bytes, str, str, list[str], dict[str, Any]]:
    """
    Retorna (wav_bytes, quality, isolation_status, warnings, meta).
    Nunca inventa stems — se Demucs falhar, devolve a mistura convertida.
    """
    warnings: list[str] = []
    meta: dict[str, Any] = {"source_filename": Path(filename).name}

    wav_bytes, conv_w = ensure_ref_wav_bytes(data, filename)
    warnings.extend(conv_w)

    if not _demucs_available():
        warnings.append(
            "Separação vocal (Demucs) indisponível neste ambiente — "
            "usando a mistura completa. A comparação melódica terá confiança reduzida "
            "em faixas com acompanhamento denso."
        )
        return wav_bytes, "mixture", "unavailable", warnings, meta

    with tempfile.TemporaryDirectory(prefix="vc_artist_") as tmp:
        work = Path(tmp)
        src = work / "mix.wav"
        src.write_bytes(wav_bytes)
        try:
            vocals_path = _run_demucs_vocals(src, work)
            out = vocals_path.read_bytes()
            meta["demucs_model"] = os.getenv("DEMUCS_MODEL", "htdemucs")
            warnings.append(
                "Voz isolada localmente com Demucs (stem vocals). "
                "Qualidade depende do mix comercial; artefatos podem afetar o F0."
            )
            return out, "vocals_stem", "ok", warnings, meta
        except Exception as exc:
            logger.warning("Demucs artist isolation failed: %s", exc)
            warnings.append(
                f"Separação vocal falhou ({exc!s:.160}) — usando mistura completa "
                "com confiança reduzida. Prefira trecho com voz mais exposta ou MIDI."
            )
            return wav_bytes, "mixture_low_confidence", "failed", warnings, meta


def parse_artist_reference_bytes(
    data: bytes,
    *,
    filename: str = "artist.mp3",
    params: YinParams | None = None,
    isolate: bool = True,
) -> ArtistReferenceResult:
    """Prepara referência a partir da música original do artista."""
    if isolate:
        wav_bytes, quality, iso_status, warnings, meta = isolate_artist_vocals(
            data, filename=filename
        )
        parse_name = "artist_vocals.wav" if quality == "vocals_stem" else filename
    else:
        wav_bytes, warnings = ensure_ref_wav_bytes(data, filename)
        quality, iso_status = "mixture", "skipped"
        meta = {"source_filename": Path(filename).name}
        parse_name = filename

    ref = parse_audio_reference_bytes(wav_bytes, filename=parse_name, params=params)
    ref.warnings = list(ref.warnings) + list(warnings)
    ref.source_type = "artist_audio"

    # Qualidade pós-F0: poucas notas → baixa confiança
    if len(ref.notes) < 4:
        quality = "mixture_low_confidence"
        ref.warnings.append(
            "Poucas notas segmentáveis na referência do artista — "
            "comparação limitada; resultados não devem ser tratados como verdade absoluta."
        )
    elif quality == "mixture":
        ref.warnings.append(
            "Referência = mistura (sem stem vocal). Desvios de afinação podem "
            "refletir harmônicos do acompanhamento, não só a melodia cantada."
        )

    selected = "vocals" if quality == "vocals_stem" else "mixture_lead_estimate"

    return ArtistReferenceResult(
        reference=ref,
        quality=quality,
        isolation_status=iso_status,
        selected_vocal_part=selected,
        warnings=list(ref.warnings),
        meta=meta,
    )
