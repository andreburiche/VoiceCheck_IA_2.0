"""
VoiceCheck — coerência melódica experimental (sem referência absoluta).

Identifica frases semelhantes e diferenças de altura/duração entre repetições.
Variações artísticas NÃO são classificadas automaticamente como erro.
"""

from __future__ import annotations

import uuid
from typing import Any

import numpy as np

from app.services.voicecheck_alignment import segment_sung_notes
from app.services.voicecheck_events import AcousticEvent
from app.services.voicecheck_pitch import PitchFrame, midi_to_note_name


def analyze_melodic_consistency(
    frames: list[PitchFrame],
    *,
    phrase_len: int = 4,
    pitch_tol_st: float = 1.0,
    max_events: int = 12,
) -> dict[str, Any]:
    """
    Compara janelas de notas segmentadas em busca de repetições semelhantes.
    """
    sung = segment_sung_notes(frames, min_duration=0.08)
    events: list[AcousticEvent] = []
    pairs: list[dict[str, Any]] = []

    if len(sung) < phrase_len * 2:
        return {
            "module": "melodic_consistency_experimental",
            "status": "insufficient_notes",
            "phrase_length": phrase_len,
            "note_count": len(sung),
            "similar_phrase_pairs": 0,
            "events": [],
            "disclaimer": (
                "Módulo experimental: requer mais notas segmentáveis para "
                "comparar frases semelhantes."
            ),
        }

    midis = np.asarray([int(round(s.median_midi)) for s in sung], dtype=np.int32)
    durs = np.asarray(
        [max(0.05, s.end_seconds - s.start_seconds) for s in sung], dtype=np.float64
    )

    n = len(sung)
    seen: set[tuple[int, int]] = set()

    for i in range(0, n - phrase_len + 1):
        a = midis[i : i + phrase_len]
        for j in range(i + phrase_len, n - phrase_len + 1):
            key = (i, j)
            if key in seen:
                continue
            b = midis[j : j + phrase_len]
            # Contorno relativo (diferenças)
            da = np.diff(a.astype(np.float64))
            db = np.diff(b.astype(np.float64))
            if len(da) == 0:
                continue
            contour_dist = float(np.mean(np.abs(da - db)))
            # Transposição constante
            offset = float(np.median(b.astype(np.float64) - a.astype(np.float64)))
            pitch_dist = float(
                np.mean(np.abs(b.astype(np.float64) - a.astype(np.float64) - offset))
            )
            similar = contour_dist <= 1.25 and pitch_dist <= pitch_tol_st
            if not similar:
                continue
            seen.add(key)

            dur_a = float(np.sum(durs[i : i + phrase_len]))
            dur_b = float(np.sum(durs[j : j + phrase_len]))
            dur_ratio = dur_b / max(dur_a, 1e-6)
            start_a = sung[i].start_seconds
            end_a = sung[i + phrase_len - 1].end_seconds
            start_b = sung[j].start_seconds
            end_b = sung[j + phrase_len - 1].end_seconds

            pitch_delta = round(offset, 2)
            dur_delta_pct = round((dur_ratio - 1.0) * 100.0, 1)

            pairs.append(
                {
                    "phrase_a_start": round(start_a, 3),
                    "phrase_a_end": round(end_a, 3),
                    "phrase_b_start": round(start_b, 3),
                    "phrase_b_end": round(end_b, 3),
                    "median_pitch_offset_semitones": pitch_delta,
                    "duration_delta_percent": dur_delta_pct,
                    "contour_distance": round(contour_dist, 3),
                }
            )

            # Só gera ocorrência se houver diferença relevante (ponto de revisão)
            notable_pitch = abs(pitch_delta) >= 0.75
            notable_dur = abs(dur_delta_pct) >= 18.0
            if not (notable_pitch or notable_dur):
                continue

            bits: list[str] = []
            if notable_pitch:
                bits.append(
                    f"altura mediana ~{pitch_delta:+.1f} semitom(s) entre as duas frases"
                )
            if notable_dur:
                bits.append(f"duração ~{dur_delta_pct:+.0f}% entre as frases")
            note_a = midi_to_note_name(float(a[0]))
            note_b = midi_to_note_name(float(b[0]))
            desc = (
                "Frases semelhantes com variação — ponto para revisão "
                f"(não classificado como erro): {'; '.join(bits)}. "
                f"Inícios aproximados {note_a} → {note_b}."
            )
            events.append(
                AcousticEvent(
                    category="melodic_consistency_variation",
                    start_seconds=round(start_b, 3),
                    end_seconds=round(end_b, 3),
                    title="Variação entre frases semelhantes",
                    description=desc,
                    evidence={
                        "phrase_a": [round(start_a, 3), round(end_a, 3)],
                        "pitch_offset_semitones": pitch_delta,
                        "duration_delta_percent": dur_delta_pct,
                        "experimental": True,
                    },
                    confidence=0.55,
                    recommendation_key="melodic_consistency_review",
                    severity="info",
                    id=str(uuid.uuid4()),
                )
            )
            if len(events) >= max_events:
                break
        if len(events) >= max_events:
            break

    return {
        "module": "melodic_consistency_experimental",
        "status": "ok" if pairs else "no_similar_phrases",
        "phrase_length": phrase_len,
        "note_count": len(sung),
        "similar_phrase_pairs": len(pairs),
        "pairs_sample": pairs[:8],
        "events": [e.to_dict() for e in events],
        "disclaimer": (
            "Módulo experimental. Diferenças entre frases semelhantes são "
            "pontos de revisão — variação artística não é marcada como erro."
        ),
    }
