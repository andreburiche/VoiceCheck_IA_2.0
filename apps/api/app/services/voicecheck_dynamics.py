"""Dinâmica: quedas abruptas de energia, picos e clipping."""

from __future__ import annotations

import numpy as np

from app.services.voicecheck_events import AcousticEvent
from app.services.voicecheck_pitch import PitchFrame


def detect_dynamics(
    frames: list[PitchFrame],
    samples: np.ndarray | None,
    sample_rate: int,
) -> list[AcousticEvent]:
    events: list[AcousticEvent] = []
    if samples is not None and len(samples) > 0:
        events.extend(_detect_clipping(samples, sample_rate))
    events.extend(_detect_rms_drops(frames))
    return events[:20]


def _detect_clipping(samples: np.ndarray, sr: int) -> list[AcousticEvent]:
    abs_s = np.abs(samples.astype(np.float64))
    thr = 0.98
    clipped = abs_s >= thr
    if not np.any(clipped):
        return []
    # agrupa runs
    events: list[AcousticEvent] = []
    idx = np.where(clipped)[0]
    if len(idx) < max(8, int(0.002 * sr)):
        return []
    start = int(idx[0])
    prev = start
    for k in idx[1:]:
        if k - prev > int(0.01 * sr):
            events.append(_clip_event(start, prev, sr, float(np.mean(abs_s[start : prev + 1]))))
            start = int(k)
        prev = int(k)
    events.append(_clip_event(start, prev, sr, float(np.mean(abs_s[start : prev + 1]))))
    return [e for e in events if e.end_seconds - e.start_seconds >= 0.005][:5]


def _clip_event(start: int, end: int, sr: int, mean_abs: float) -> AcousticEvent:
    return AcousticEvent(
        category="possible_clipping",
        start_seconds=start / float(sr),
        end_seconds=end / float(sr),
        title="Possível clipping",
        description="Amostras próximas da saturação digital — risco de distorção audível.",
        evidence={"mean_abs_amplitude": round(mean_abs, 4), "threshold": 0.98},
        confidence=min(0.95, 0.5 + mean_abs * 0.4),
        recommendation_key="clipping",
        severity="caution",
    )


def _detect_rms_drops(frames: list[PitchFrame]) -> list[AcousticEvent]:
    if len(frames) < 10:
        return []
    rms = np.asarray([f.rms for f in frames], dtype=np.float64)
    # suaviza
    kernel = np.ones(3) / 3.0
    sm = np.convolve(rms, kernel, mode="same")
    events: list[AcousticEvent] = []
    for i in range(4, len(frames) - 2):
        pre = float(np.median(sm[i - 4 : i]))
        cur = float(sm[i])
        post = float(np.median(sm[i + 1 : i + 3]))
        if pre < 0.02:
            continue
        # queda ≥ ~12 dB e recuperação parcial (não silêncio de frase longo)
        drop_db = 20.0 * np.log10(max(cur, 1e-6) / pre)
        if drop_db > -12:
            continue
        recover = post > cur * 1.4
        # contexto: havia voz antes
        voiced_pre = sum(1 for f in frames[i - 4 : i] if f.is_valid) >= 2
        if not voiced_pre:
            continue
        # evita marcar fim de frase (silêncio longo depois)
        silence_after = all(f.rms < 0.012 for f in frames[i : min(len(frames), i + 12)])
        if silence_after and not recover:
            continue
        conf = min(0.85, 0.4 + min(0.4, abs(drop_db) / 40.0) + (0.1 if recover else 0.0))
        if conf < 0.55:
            continue
        events.append(
            AcousticEvent(
                category="abrupt_intensity_drop",
                start_seconds=frames[i - 1].time_seconds,
                end_seconds=frames[min(len(frames) - 1, i + 2)].time_seconds,
                title="Queda abrupta de intensidade",
                description=(
                    "Envelope RMS caiu rapidamente em trecho com atividade vocal prévia."
                ),
                evidence={
                    "drop_db": round(float(drop_db), 1),
                    "pre_rms": round(pre, 4),
                    "trough_rms": round(cur, 4),
                    "recovered": recover,
                },
                confidence=conf,
                recommendation_key="dynamics_drop",
                severity="notice",
            )
        )
    # dedupe temporal
    return _dedupe(events, min_gap=0.2)


def _dedupe(events: list[AcousticEvent], min_gap: float) -> list[AcousticEvent]:
    if not events:
        return []
    events = sorted(events, key=lambda e: e.start_seconds)
    out = [events[0]]
    for e in events[1:]:
        if e.start_seconds - out[-1].start_seconds >= min_gap:
            out.append(e)
    return out
