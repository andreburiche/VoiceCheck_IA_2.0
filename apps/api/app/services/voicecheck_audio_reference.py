"""
VoiceCheck — referência por áudio (gravação modelo / guia).

Extrai F0 da referência → segmenta em notas monofônicas → NormalizedReference.
Não inventa partitura; a qualidade depende da monofonia e do SNR da ref.
"""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path

import numpy as np

from app.services.voicecheck_alignment import segment_sung_notes
from app.services.voicecheck_media import extract_audio_wav
from app.services.voicecheck_pitch import (
    YinParams,
    extract_f0_from_wav_bytes,
    load_wav_bytes,
)
from app.services.voicecheck_reference import NormalizedReference, ReferenceNote

AUDIO_REF_EXTS = {".wav", ".mp3", ".flac", ".m4a", ".mp4", ".mov", ".ogg", ".aac"}


def is_audio_reference_filename(filename: str) -> bool:
    return Path(filename or "").suffix.lower() in AUDIO_REF_EXTS


def ensure_ref_wav_bytes(data: bytes, filename: str) -> tuple[bytes, list[str]]:
    """Garante WAV PCM 16-bit mono. Converte via FFmpeg se necessário."""
    warnings: list[str] = []
    name = (filename or "ref.wav").lower()
    if data[:4] == b"RIFF" and (name.endswith(".wav") or b"WAVE" in data[:16]):
        return data, warnings

    suffix = Path(name).suffix.lower() or ".bin"
    if suffix not in AUDIO_REF_EXTS:
        raise ValueError(f"Formato de áudio-ref não suportado: {suffix}")

    with tempfile.TemporaryDirectory(prefix="vc_aref_") as tmp:
        src = Path(tmp) / f"src{suffix}"
        dst = Path(tmp) / "ref.wav"
        src.write_bytes(data)
        extract_audio_wav(src, dst, sample_rate=44100)
        warnings.append(
            f"Referência convertida para WAV 44.1 kHz mono via FFmpeg (origem {suffix})."
        )
        return dst.read_bytes(), warnings


def parse_audio_reference_bytes(
    data: bytes,
    *,
    filename: str = "ref.wav",
    params: YinParams | None = None,
) -> NormalizedReference:
    """Áudio → notas de referência segmentadas do F0."""
    params = params or YinParams()
    wav_bytes, conv_w = ensure_ref_wav_bytes(data, filename)
    frames, sr = extract_f0_from_wav_bytes(wav_bytes, params)
    samples, sr2 = load_wav_bytes(wav_bytes)
    duration = len(samples) / float(sr2)
    sung = segment_sung_notes(frames, min_duration=0.08)

    warnings = list(conv_w)
    warnings.append(
        "Referência por áudio: notas derivadas do F0 (monofonia). "
        "Acompanhamento denso ou polifonia degradam a segmentação."
    )

    if not sung:
        valid_pct = (
            100.0 * sum(1 for f in frames if f.is_valid) / len(frames) if frames else 0.0
        )
        raise ValueError(
            f"Referência sem notas segmentáveis (F0 válido ≈ {valid_pct:.0f}%). "
            "Use áudio monofônico mais limpo ou MIDI/MusicXML."
        )

    notes: list[ReferenceNote] = []
    for s in sung:
        midi_i = int(round(s.median_midi))
        notes.append(
            ReferenceNote(
                id=str(uuid.uuid4()),
                pitch_midi=midi_i,
                frequency_hz=round(float(s.median_hz), 4),
                start_seconds=round(s.start_seconds, 4),
                end_seconds=round(s.end_seconds, 4),
                duration_seconds=round(max(0.02, s.end_seconds - s.start_seconds), 4),
                part_id="audio_ref",
                source="audio",
                confidence=min(1.0, s.valid_frames / 12.0),
            )
        )

    # tempo estimado pela mediana de duração de nota × heurística fraca
    tempo_bpm: float | None = None
    durs = [n.duration_seconds for n in notes if 0.15 <= n.duration_seconds <= 1.2]
    if durs:
        # assume figura ~ semínima
        med = float(np.median(durs))
        if med > 0:
            tempo_bpm = round(60.0 / med, 1)

    return NormalizedReference(
        source_type="audio",
        selected_part=Path(filename).name or "audio_ref",
        tempo_bpm=tempo_bpm,
        notes=notes,
        tracks=[
            {
                "index": 0,
                "name": Path(filename).name or "audio_ref",
                "note_count": len(notes),
                "id": "audio_ref",
                "duration_seconds": round(duration, 3),
                "sample_rate": sr2,
            }
        ],
        warnings=warnings,
    )
