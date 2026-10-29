"""Caracterização de oscilação periódica de F0 (vibrato vs irregular)."""

from __future__ import annotations

import numpy as np

from app.services.voicecheck_events import AcousticEvent
from app.services.voicecheck_pitch import PitchFrame
from app.services.voicecheck_stability import _autocorr_peak_rate, _hz_to_cents_dev


def detect_vibrato_features(frames: list[PitchFrame]) -> list[AcousticEvent]:
    """Emite eventos informativos (não 'erro') sobre vibrato regular ou irregular."""
    if len(frames) < 20:
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
        if dur < 0.7:
            i = j
            continue
        hz = np.asarray(
            [f.frequency_hz for f in frames[i:j] if f.frequency_hz is not None],
            dtype=np.float64,
        )
        if len(hz) < 16:
            i = j
            continue
        cents = _hz_to_cents_dev(hz)
        extent = float(np.percentile(cents, 95) - np.percentile(cents, 5))
        rate, ac_peak = _autocorr_peak_rate(cents, hop)
        if rate is None or extent < 12:
            i = j
            continue
        regular = 4.2 <= rate <= 7.8 and ac_peak >= 0.35 and 18 <= extent <= 160
        if regular:
            events.append(
                AcousticEvent(
                    category="regular_vibrato",
                    start_seconds=frames[i].time_seconds,
                    end_seconds=frames[j - 1].time_seconds,
                    title="Oscilação periódica compatível com vibrato",
                    description=(
                        f"Taxa aproximada {rate:.1f} Hz e extensão ~{extent:.0f} cents "
                        "em trecho sustentado (característica observável, não erro)."
                    ),
                    evidence={
                        "rate_hz": round(rate, 2),
                        "extent_cents": round(extent, 1),
                        "autocorr_peak": round(ac_peak, 3),
                        "duration_seconds": round(dur, 3),
                    },
                    confidence=min(0.9, 0.45 + ac_peak * 0.4),
                    recommendation_key=None,
                    severity="info",
                )
            )
        elif extent >= 40 and ac_peak < 0.28:
            events.append(
                AcousticEvent(
                    category="irregular_pitch_modulation",
                    start_seconds=frames[i].time_seconds,
                    end_seconds=frames[j - 1].time_seconds,
                    title="Modulação de F0 irregular",
                    description=(
                        "Oscilação de altura sem periodicidade clara de vibrato — "
                        "pode ser portamento, instabilidade ou ruído na estimativa."
                    ),
                    evidence={
                        "rate_hz_estimate": round(rate, 2),
                        "extent_cents": round(extent, 1),
                        "autocorr_peak": round(ac_peak, 3),
                    },
                    confidence=min(0.75, 0.4 + (40 - ac_peak * 100) * 0.005),
                    recommendation_key="stability",
                    severity="notice",
                )
            )
        i = j
    return events[:12]
