"""
Detecção de possíveis interrupções da emissão (voice breaks).

Exige múltiplas evidências: gap de F0 válido + queda de energia + regiões
vozeadas sustentadas em ambos os lados. Não marca silêncio de frase.
"""

from __future__ import annotations

import numpy as np

from app.services.voicecheck_events import AcousticEvent
from app.services.voicecheck_pitch import PitchFrame


def detect_voice_breaks(frames: list[PitchFrame]) -> list[AcousticEvent]:
    if len(frames) < 8:
        return []

    times = np.asarray([f.time_seconds for f in frames], dtype=np.float64)
    valid = np.asarray([f.is_valid for f in frames], dtype=bool)
    rms = np.asarray([f.rms for f in frames], dtype=np.float64)
    conf = np.asarray(
        [f.confidence if f.confidence is not None else 0.0 for f in frames],
        dtype=np.float64,
    )

    events: list[AcousticEvent] = []
    i = 0
    n = len(frames)
    while i < n:
        if not valid[i]:
            i += 1
            continue
        # região vozeada
        j = i
        while j < n and valid[j]:
            j += 1
        voiced_dur = times[j - 1] - times[i] if j > i else 0.0
        # gap seguinte
        k = j
        while k < n and not valid[k]:
            k += 1
        if k >= n or j >= n:
            break
        gap_start = times[j - 1] if j > i else times[j]
        gap_end = times[k]
        gap = gap_end - gap_start
        # próximo vozeado
        m = k
        while m < n and valid[m]:
            m += 1
        next_dur = times[m - 1] - times[k] if m > k else 0.0

        # critérios multi-evidência
        gap_ok = 0.035 <= gap <= 0.28
        sides_ok = voiced_dur >= 0.22 and next_dur >= 0.22
        pre_rms = float(np.median(rms[max(0, j - 6) : j])) if j > i else 0.0
        gap_rms = float(np.median(rms[j:k])) if k > j else 0.0
        post_rms = float(np.median(rms[k : min(n, k + 6)])) if m > k else 0.0
        energy_dip = pre_rms > 0.015 and gap_rms < pre_rms * 0.45 and post_rms > gap_rms * 1.6
        conf_ok = float(np.median(conf[max(0, j - 5) : j])) >= 0.35 if j > i else False

        if gap_ok and sides_ok and energy_dip and conf_ok:
            conf_score = min(
                0.95,
                0.35
                + 0.2 * (1.0 if energy_dip else 0)
                + 0.15 * (1.0 if conf_ok else 0)
                + 0.15 * min(1.0, voiced_dur / 0.5)
                + 0.15 * min(1.0, next_dur / 0.5),
            )
            events.append(
                AcousticEvent(
                    category="possible_voice_break",
                    start_seconds=float(gap_start),
                    end_seconds=float(gap_end),
                    title="Possível interrupção da emissão",
                    description=(
                        "Interrupção breve da periodicidade entre duas regiões sustentadas, "
                        "com queda de energia no intervalo."
                    ),
                    evidence={
                        "gap_seconds": round(float(gap), 3),
                        "pre_voiced_seconds": round(float(voiced_dur), 3),
                        "post_voiced_seconds": round(float(next_dur), 3),
                        "pre_rms": round(pre_rms, 4),
                        "gap_rms": round(gap_rms, 4),
                        "post_rms": round(post_rms, 4),
                    },
                    confidence=conf_score,
                    recommendation_key="voice_break",
                    severity="caution",
                )
            )
        i = k

    return events[:20]
