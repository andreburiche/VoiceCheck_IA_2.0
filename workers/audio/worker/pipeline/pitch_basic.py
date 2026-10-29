"""Transcrição de pitch no worker.

Ordem:
1. Spotify Basic Pitch (MIT) se o pacote estiver instalado (INSTALL_BASIC_PITCH=1)
2. Fallback YIN/numpy (`worker_yin_v1`) — sempre disponível com numpy
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from worker.pipeline.pitch_yin import estimate_notes_from_wav

logger = logging.getLogger(__name__)


def _from_basic_pitch(wav_path: Path) -> tuple[list[dict[str, Any]], str]:
    from basic_pitch.inference import predict  # type: ignore[import-untyped]

    _model_out, midi_data, _note_events = predict(str(wav_path))
    notes: list[dict[str, Any]] = []
    # pretty_midi Note objects
    for inst in midi_data.instruments:
        for n in inst.notes:
            notes.append(
                {
                    "pitch_midi": int(n.pitch),
                    "start_ms": int(n.start * 1000),
                    "end_ms": int(n.end * 1000),
                    "velocity": int(max(1, min(127, n.velocity))),
                }
            )
    notes.sort(key=lambda x: x["start_ms"])
    # Limita densidade
    return notes[:800], "worker_basic_pitch_v1"


def transcribe_wav(wav_path: Path) -> tuple[list[dict[str, Any]], str, dict[str, Any]]:
    """Retorna (notes, engine, meta)."""
    try:
        notes, engine = _from_basic_pitch(wav_path)
        if notes:
            conf = min(0.92, 0.45 + len(notes) / 250)
            return notes, engine, {"backend": "basic_pitch", "note_count": len(notes), "confidence_est": conf}
        logger.warning("basic_pitch_empty_fallback_yin path=%s", wav_path)
    except ImportError:
        logger.info("basic_pitch_not_installed using_yin")
    except Exception as exc:  # noqa: BLE001
        logger.warning("basic_pitch_failed using_yin error=%s", exc)

    notes = estimate_notes_from_wav(wav_path)
    conf = min(0.8, 0.3 + len(notes) / 220) if notes else 0.0
    return notes, "worker_yin_v1", {"backend": "yin_numpy", "note_count": len(notes), "confidence_est": conf}
