"""
Orquestrador da análise técnica sem referência (VoiceCheck 4.5).

Agrega detectores com evidências múltiplas → events + positive_findings.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from app.services.voicecheck_breath import detect_breath_events
from app.services.voicecheck_dynamics import detect_dynamics
from app.services.voicecheck_events import AcousticEvent
from app.services.voicecheck_phrasing import detect_phrasing
from app.services.voicecheck_pitch import PitchFrame
from app.services.voicecheck_positive import detect_positive_findings
from app.services.voicecheck_stability import detect_stability_issues
from app.services.voicecheck_vibrato import detect_vibrato_features
from app.services.voicecheck_voice_breaks import detect_voice_breaks

TECH_VERSION = "voicecheck_tech_v45"


def run_technical_analysis(
    frames: list[PitchFrame],
    *,
    samples: np.ndarray | None = None,
    sample_rate: int = 44100,
) -> dict[str, Any]:
    voice_breaks = detect_voice_breaks(frames)
    stability = detect_stability_issues(frames)
    dynamics = detect_dynamics(frames, samples, sample_rate)
    vibrato = detect_vibrato_features(frames)
    breathing = detect_breath_events(frames)
    phrasing = detect_phrasing(frames)

    # vibrato regular não compete com "instável" no mesmo intervalo
    stability = _suppress_unstable_if_regular_vibrato(stability, vibrato)

    all_events = _merge_sorted(
        voice_breaks + stability + dynamics + vibrato + breathing + phrasing
    )
    # remove eventos de baixa confiança
    all_events = [e for e in all_events if (e.confidence or 0) >= 0.52]

    positives = detect_positive_findings(frames, all_events, samples=samples)

    return {
        "technical_version": TECH_VERSION,
        "technical_analysis": {
            "voice_breaks": [e.to_dict() for e in voice_breaks if (e.confidence or 0) >= 0.52],
            "stability": [e.to_dict() for e in stability if (e.confidence or 0) >= 0.52],
            "breathing": [e.to_dict() for e in breathing if (e.confidence or 0) >= 0.52],
            "vibrato": [e.to_dict() for e in vibrato if (e.confidence or 0) >= 0.52],
            "dynamics": [e.to_dict() for e in dynamics if (e.confidence or 0) >= 0.52],
            "phrasing": [e.to_dict() for e in phrasing if (e.confidence or 0) >= 0.52],
        },
        "events": [e.to_dict() for e in all_events],
        "positive_findings": [p.to_dict() for p in positives],
    }


def _suppress_unstable_if_regular_vibrato(
    stability: list[AcousticEvent],
    vibrato: list[AcousticEvent],
) -> list[AcousticEvent]:
    regs = [v for v in vibrato if v.category == "regular_vibrato"]
    if not regs:
        return stability
    out: list[AcousticEvent] = []
    for s in stability:
        overlap = False
        for v in regs:
            if s.start_seconds < v.end_seconds and s.end_seconds > v.start_seconds:
                overlap = True
                break
        if not overlap:
            out.append(s)
    return out


def _merge_sorted(events: list[AcousticEvent]) -> list[AcousticEvent]:
    return sorted(events, key=lambda e: (e.start_seconds, e.category))
