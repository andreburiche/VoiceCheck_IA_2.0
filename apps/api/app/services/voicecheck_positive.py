"""Pontos positivos fundamentados em medições (sem elogios genéricos)."""

from __future__ import annotations

import numpy as np

from app.services.voicecheck_events import AcousticEvent, PositiveFinding
from app.services.voicecheck_pitch import PitchFrame
from app.services.voicecheck_stability import _hz_to_cents_dev


def detect_positive_findings(
    frames: list[PitchFrame],
    events: list[AcousticEvent],
    *,
    samples: np.ndarray | None,
) -> list[PositiveFinding]:
    findings: list[PositiveFinding] = []
    findings.extend(_stable_sustains(frames))
    findings.extend(_continuity(frames))
    if samples is not None and len(samples) > 0:
        peak = float(np.max(np.abs(samples)))
        if peak < 0.95:
            findings.append(
                PositiveFinding(
                    key="no_clipping",
                    title="Sem saturação digital detectada",
                    description=(
                        f"Pico absoluto das amostras = {peak:.3f} (< 0.95) — sem evidência de clipping."
                    ),
                    evidence={"peak_abs": round(peak, 4)},
                    confidence=0.8 if peak < 0.9 else 0.65,
                )
            )
    # continuidade sem voice breaks
    if not any(e.category == "possible_voice_break" for e in events):
        voiced = sum(1 for f in frames if f.is_valid)
        if voiced >= 30:
            findings.append(
                PositiveFinding(
                    key="no_voice_break_detected",
                    title="Sem interrupção breve detectada",
                    description=(
                        "Não houve gap curto com queda de energia entre regiões sustentadas "
                        "que atendesse aos critérios multi-evidência de possível quebra."
                    ),
                    evidence={"voiced_frames": voiced},
                    confidence=0.6,
                )
            )
    return findings[:12]


def _stable_sustains(frames: list[PitchFrame]) -> list[PositiveFinding]:
    out: list[PositiveFinding] = []
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
        if dur < 0.8:
            i = j
            continue
        hz = np.asarray(
            [f.frequency_hz for f in frames[i:j] if f.frequency_hz is not None],
            dtype=np.float64,
        )
        if len(hz) < 10:
            i = j
            continue
        cents = _hz_to_cents_dev(hz)
        p2p = float(np.percentile(cents, 95) - np.percentile(cents, 5))
        if p2p <= 28:
            out.append(
                PositiveFinding(
                    key="stable_sustain",
                    title="Sustentação com F0 estável",
                    description=(
                        f"Trecho de {dur:.2f}s com variação P5–P95 de {p2p:.0f} cents "
                        "(abaixo do limiar de instabilidade usado nesta análise)."
                    ),
                    evidence={
                        "duration_seconds": round(dur, 3),
                        "cents_p5_p95": round(p2p, 1),
                        "median_hz": round(float(np.median(hz)), 2),
                    },
                    start_seconds=frames[i].time_seconds,
                    end_seconds=frames[j - 1].time_seconds,
                    confidence=min(0.9, 0.55 + (28 - p2p) / 80.0),
                )
            )
        i = j
    return out[:5]


def _continuity(frames: list[PitchFrame]) -> list[PositiveFinding]:
    best = 0.0
    start = None
    cur_s = None
    last = 0.0
    for f in frames:
        last = f.time_seconds
        if f.is_valid:
            if cur_s is None:
                cur_s = f.time_seconds
        else:
            if cur_s is not None:
                d = f.time_seconds - cur_s
                if d > best:
                    best = d
                    start = cur_s
            cur_s = None
    if cur_s is not None and last - cur_s > best:
        best = last - cur_s
        start = cur_s
    if best >= 1.5 and start is not None:
        return [
            PositiveFinding(
                key="continuous_voicing",
                title="Continuidade de emissão",
                description=(
                    f"Região vozeada contínua de {best:.2f}s — boa continuidade de periodicidade."
                ),
                evidence={"continuous_seconds": round(best, 3)},
                start_seconds=start,
                end_seconds=start + best,
                confidence=min(0.85, 0.5 + best / 8.0),
            )
        ]
    return []
