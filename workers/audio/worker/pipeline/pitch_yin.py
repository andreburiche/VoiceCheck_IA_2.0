"""Estimativa monofônica F0 → notas (YIN/autocorr). Sem TensorFlow."""

from __future__ import annotations

import math
import wave
from pathlib import Path
from typing import Any

import numpy as np


def load_wav_mono(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wf:
        sr = wf.getframerate()
        nch = wf.getnchannels()
        sw = wf.getsampwidth()
        nframes = wf.getnframes()
        raw = wf.readframes(nframes)
    if sw != 2:
        raise ValueError(f"WAV precisa ser PCM 16-bit (got sampwidth={sw})")
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if nch > 1:
        data = data.reshape(-1, nch).mean(axis=1)
    return data, sr


def hz_to_midi(hz: float) -> int:
    return int(round(69 + 12 * math.log2(hz / 440.0)))


def estimate_notes(
    samples: np.ndarray,
    sr: int,
    *,
    hop_sec: float = 0.05,
    min_hz: float = 80.0,
    max_hz: float = 1000.0,
    max_notes: int = 500,
) -> list[dict[str, Any]]:
    hop = max(1, int(sr * hop_sec))
    win = max(hop * 2, int(sr * 0.04))
    min_lag = int(sr / max_hz)
    max_lag = int(sr / min_hz)

    frames: list[tuple[float, int | None, float]] = []
    for start in range(0, max(0, len(samples) - win), hop):
        chunk = samples[start : start + win]
        amp = float(np.sqrt(np.mean(chunk * chunk)))
        t = start / sr
        if amp < 0.01:
            frames.append((t, None, amp))
            continue

        best_lag = 0
        best_corr = -1.0
        # Autocorr normalizada (YIN simplificado)
        for lag in range(min_lag, max_lag + 1):
            a = chunk[:-lag] if lag < len(chunk) else chunk[:0]
            b = chunk[lag:]
            if len(a) < 8:
                continue
            denom = float(np.dot(a, a)) + 1e-9
            corr = float(np.dot(a, b) / denom)
            if corr > best_corr:
                best_corr = corr
                best_lag = lag

        if best_corr < 0.3 or best_lag <= 0:
            frames.append((t, None, amp))
            continue
        hz = sr / best_lag
        midi = hz_to_midi(hz)
        if midi < 36 or midi > 84:
            frames.append((t, None, amp))
            continue
        frames.append((t, midi, amp))

    notes: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None
    for t, midi, amp in frames:
        if midi is None:
            if cur:
                notes.append(cur)
                cur = None
            continue
        vel = max(40, min(110, int(amp * 400)))
        if not cur or cur["pitch_midi"] != midi:
            if cur:
                notes.append(cur)
            cur = {
                "pitch_midi": midi,
                "start_ms": int(t * 1000),
                "end_ms": int((t + hop_sec) * 1000),
                "velocity": vel,
            }
        else:
            cur["end_ms"] = int((t + hop_sec) * 1000)
            cur["velocity"] = max(cur["velocity"], vel)
    if cur:
        notes.append(cur)

    min_dur_ms = int(hop_sec * 1.5 * 1000)
    out = [n for n in notes if (n["end_ms"] - n["start_ms"]) >= min_dur_ms]
    return out[:max_notes]


def estimate_notes_from_wav(path: Path) -> list[dict[str, Any]]:
    samples, sr = load_wav_mono(path)
    # Limita a ~4 min para CPU do worker
    max_samples = sr * 240
    if len(samples) > max_samples:
        samples = samples[:max_samples]
    return estimate_notes(samples, sr)
