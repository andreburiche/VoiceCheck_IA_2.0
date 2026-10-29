"""
Possíveis inspirações audíveis entre frases.

Heurística conservadora: gap curto-médio com energia baixa, flanqueado por
regiões vozeadas, sem marcar silêncios longos de pausa deliberada.
"""

from __future__ import annotations

import numpy as np

from app.services.voicecheck_events import AcousticEvent
from app.services.voicecheck_pitch import PitchFrame


def detect_breath_events(frames: list[PitchFrame]) -> list[AcousticEvent]:
    if len(frames) < 12:
        return []
    events: list[AcousticEvent] = []
    i = 0
    n = len(frames)
    while i < n:
        if not frames[i].is_valid:
            i += 1
            continue
        j = i
        while j < n and frames[j].is_valid:
            j += 1
        pre_dur = frames[j - 1].time_seconds - frames[i].time_seconds if j > i else 0.0
        k = j
        while k < n and not frames[k].is_valid:
            k += 1
        if k >= n or j >= n:
            break
        gap = frames[k].time_seconds - frames[j - 1].time_seconds
        m = k
        while m < n and frames[m].is_valid:
            m += 1
        post_dur = frames[m - 1].time_seconds - frames[k].time_seconds if m > k else 0.0

        # inspiração típica: 0.08–0.45s; pausa frase geralmente >0.5s
        gap_ok = 0.08 <= gap <= 0.45
        sides = pre_dur >= 0.35 and post_dur >= 0.25
        gap_frames = frames[j:k]
        if not gap_frames:
            i = k
            continue
        gap_rms = float(np.median([f.rms for f in gap_frames]))
        pre_rms = float(np.median([f.rms for f in frames[max(0, j - 5) : j]]))
        # energia residual baixa mas não zero absoluto (ruído de ar)
        residual = 0.004 <= gap_rms <= max(0.025, pre_rms * 0.35)
        unvoiced = all(not f.is_valid for f in gap_frames)

        if gap_ok and sides and residual and unvoiced:
            conf = min(
                0.8,
                0.35
                + 0.15 * (1 if residual else 0)
                + 0.15 * min(1.0, pre_dur / 0.6)
                + 0.15 * min(1.0, post_dur / 0.5)
                + (0.1 if 0.12 <= gap <= 0.35 else 0.0),
            )
            if conf >= 0.55:
                events.append(
                    AcousticEvent(
                        category="possible_audible_breath",
                        start_seconds=frames[j - 1].time_seconds,
                        end_seconds=frames[k].time_seconds,
                        title="Possível inspiração audível",
                        description=(
                            "Intervalo curto entre frases com energia residual e sem F0 válido — "
                            "compatível com respiração audível (heurística, não certeza)."
                        ),
                        evidence={
                            "gap_seconds": round(float(gap), 3),
                            "gap_rms": round(gap_rms, 4),
                            "pre_voiced_seconds": round(float(pre_dur), 3),
                            "post_voiced_seconds": round(float(post_dur), 3),
                        },
                        confidence=conf,
                        recommendation_key="breath_noise",
                        severity="info",
                    )
                )
        i = k
    return events[:12]
