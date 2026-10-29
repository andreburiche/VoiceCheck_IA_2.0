"""Instabilidade em notas sustentadas (não vibração regular)."""

from __future__ import annotations

import numpy as np

from app.services.voicecheck_events import AcousticEvent
from app.services.voicecheck_pitch import PitchFrame


def _hz_to_cents_dev(hz: np.ndarray) -> np.ndarray:
    med = float(np.median(hz))
    if med <= 0:
        return np.zeros_like(hz)
    return 1200.0 * np.log2(np.maximum(hz, 1e-9) / med)


def _autocorr_peak_rate(cents: np.ndarray, hop_sec: float) -> tuple[float | None, float]:
    """Retorna (rate_hz, normalized_peak) ou (None, 0)."""
    if len(cents) < 12 or hop_sec <= 0:
        return None, 0.0
    x = cents - np.mean(cents)
    if float(np.std(x)) < 1e-6:
        return None, 0.0
    ac = np.correlate(x, x, mode="full")
    ac = ac[len(ac) // 2 :]
    if ac[0] <= 0:
        return None, 0.0
    ac = ac / ac[0]
    # busca pico em 4–8 Hz
    i0 = max(1, int(round(1.0 / (8.0 * hop_sec))))
    i1 = min(len(ac) - 1, int(round(1.0 / (4.0 * hop_sec))))
    if i1 <= i0:
        return None, 0.0
    seg = ac[i0 : i1 + 1]
    peak_i = int(np.argmax(seg)) + i0
    peak = float(ac[peak_i])
    rate = 1.0 / (peak_i * hop_sec) if peak_i > 0 else None
    return rate, peak


def detect_stability_issues(frames: list[PitchFrame]) -> list[AcousticEvent]:
    if len(frames) < 16:
        return []
    hop = float(np.median(np.diff([f.time_seconds for f in frames]))) if len(frames) > 1 else 0.01
    hop = max(hop, 1e-3)

    events: list[AcousticEvent] = []
    i = 0
    n = len(frames)
    while i < n:
        if not frames[i].is_valid or frames[i].frequency_hz is None:
            i += 1
            continue
        j = i
        while j < n and frames[j].is_valid and frames[j].frequency_hz is not None:
            j += 1
        dur = frames[j - 1].time_seconds - frames[i].time_seconds
        if dur < 0.65:
            i = j
            continue
        hz = np.asarray(
            [f.frequency_hz for f in frames[i:j] if f.frequency_hz is not None],
            dtype=np.float64,
        )
        if len(hz) < 12:
            i = j
            continue
        cents = _hz_to_cents_dev(hz)
        p2p = float(np.percentile(cents, 95) - np.percentile(cents, 5))
        rate, ac_peak = _autocorr_peak_rate(cents, hop)
        regular_vibrato = (
            rate is not None and 4.2 <= rate <= 7.8 and ac_peak >= 0.35 and 15 <= p2p <= 140
        )
        # instável: variação alta E sem periodicidade de vibrato
        if p2p >= 48 and not regular_vibrato:
            conf = min(0.9, 0.4 + 0.01 * (p2p - 48) + (0.15 if ac_peak < 0.25 else 0.0))
            events.append(
                AcousticEvent(
                    category="unstable_sustained_pitch",
                    start_seconds=frames[i].time_seconds,
                    end_seconds=frames[j - 1].time_seconds,
                    title="Instabilidade em região sustentada",
                    description=(
                        "Variação de F0 elevada em trecho sustentado, sem padrão periódico "
                        "compatível com vibrato regular."
                    ),
                    evidence={
                        "duration_seconds": round(dur, 3),
                        "cents_p5_p95": round(p2p, 1),
                        "autocorr_peak": round(ac_peak, 3),
                        "vibrato_rate_hz": None if rate is None else round(rate, 2),
                        "classified_as_regular_vibrato": False,
                    },
                    confidence=conf,
                    recommendation_key="stability",
                    severity="notice",
                )
            )
        i = j
    return events[:15]
