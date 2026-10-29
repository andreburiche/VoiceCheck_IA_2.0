"""Pausas e interrupções de frase a partir de regiões analisáveis."""

from __future__ import annotations

from app.services.voicecheck_events import AcousticEvent
from app.services.voicecheck_pitch import PitchFrame


def detect_phrasing(frames: list[PitchFrame], min_region_sec: float = 0.2) -> list[AcousticEvent]:
    regions = _regions(frames, min_region_sec)
    if len(regions) < 2:
        return []
    events: list[AcousticEvent] = []
    for a, b in zip(regions, regions[1:]):
        gap = b[0] - a[1]
        if gap < 0.25:
            continue
        # pausa deliberada
        if gap >= 0.5:
            events.append(
                AcousticEvent(
                    category="phrase_pause",
                    start_seconds=a[1],
                    end_seconds=b[0],
                    title="Pausa entre frases",
                    description=(
                        f"Intervalo de {gap:.2f}s sem F0 confiável entre duas regiões cantadas."
                    ),
                    evidence={
                        "gap_seconds": round(gap, 3),
                        "pre_region_end": round(a[1], 3),
                        "post_region_start": round(b[0], 3),
                    },
                    confidence=min(0.85, 0.5 + min(0.3, gap / 2.0)),
                    recommendation_key=None,
                    severity="info",
                )
            )
        elif 0.25 <= gap < 0.5:
            events.append(
                AcousticEvent(
                    category="phrase_micro_gap",
                    start_seconds=a[1],
                    end_seconds=b[0],
                    title="Microinterrupção de frase",
                    description=(
                        "Pequena descontinuidade entre regiões vozeadas — pode ser articulação, "
                        "respiração rápida ou perda breve de periodicidade."
                    ),
                    evidence={"gap_seconds": round(gap, 3)},
                    confidence=0.55,
                    recommendation_key="phrasing",
                    severity="info",
                )
            )
    return events[:20]


def _regions(frames: list[PitchFrame], min_sec: float) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    start: float | None = None
    last = 0.0
    for f in frames:
        last = f.time_seconds
        if f.is_valid:
            if start is None:
                start = f.time_seconds
        else:
            if start is not None and f.time_seconds - start >= min_sec:
                out.append((start, f.time_seconds))
            start = None
    if start is not None and last - start >= min_sec:
        out.append((start, last))
    return out
