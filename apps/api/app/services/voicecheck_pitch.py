"""
VoiceCheck — extração de F0 (YIN / diferença acumulada normalizada).

Não classifica acerto/erro de afinação. Sem dependência de referência musical.
"""

from __future__ import annotations

import math
import wave
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


@dataclass
class YinParams:
    """Parâmetros configuráveis — faixas vocais tipicamente ~65–1100 Hz, ajustáveis por material."""

    frame_length: int = 2048
    hop_length: int = 512
    fmin_hz: float = 65.0
    fmax_hz: float = 1100.0
    periodicity_threshold: float = 0.15
    min_rms: float = 0.008
    # Suavização mediana (ímpar); 1 = desligada.
    median_smooth: int = 3
    # Razão máxima entre frames consecutivos antes de marcar salto de oitava.
    octave_jump_ratio: float = 1.85

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PitchFrame:
    time_seconds: float
    frequency_hz: float | None
    midi_note: float | None
    note_name: str | None
    is_valid: bool
    confidence: float | None
    rms: float

    def to_track_point(self) -> dict[str, Any]:
        return {
            "time_seconds": round(self.time_seconds, 4),
            "frequency_hz": None if self.frequency_hz is None else round(self.frequency_hz, 3),
            "midi_note": None if self.midi_note is None else round(self.midi_note, 3),
            "note_name": self.note_name,
            "is_valid": self.is_valid,
            "confidence": None if self.confidence is None else round(self.confidence, 4),
            "rms": round(float(self.rms), 5),
        }


def hz_to_midi_float(hz: float) -> float:
    return 69.0 + 12.0 * math.log2(hz / 440.0)


def midi_to_note_name(midi: float) -> str:
    m = int(round(midi))
    name = NOTE_NAMES[((m % 12) + 12) % 12]
    octave = m // 12 - 1
    return f"{name}{octave}"


def load_wav_mono(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as wf:
        if wf.getsampwidth() != 2:
            raise ValueError("WAV precisa ser PCM 16-bit")
        sr = wf.getframerate()
        nch = wf.getnchannels()
        raw = wf.readframes(wf.getnframes())
    data = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if nch > 1:
        data = data.reshape(-1, nch).mean(axis=1)
    return data, sr


def load_wav_bytes(data: bytes) -> tuple[np.ndarray, int]:
    import io

    with wave.open(io.BytesIO(data), "rb") as wf:
        if wf.getsampwidth() != 2:
            raise ValueError("WAV precisa ser PCM 16-bit")
        sr = wf.getframerate()
        nch = wf.getnchannels()
        raw = wf.readframes(wf.getnframes())
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if nch > 1:
        samples = samples.reshape(-1, nch).mean(axis=1)
    return samples, sr


def _yin_difference(x: np.ndarray, max_lag: int) -> np.ndarray:
    """d(τ) = Σ (x[j] − x[j+τ])² em O(W log W) via autocorrelação + energia."""
    w = len(x)
    energy = x * x
    c = np.concatenate(([0.0], np.cumsum(energy)))
    # r[τ] = Σ x[j] x[j+τ]
    r = np.correlate(x, x, mode="full")[w - 1 : w + max_lag]
    taus = np.arange(1, max_lag + 1, dtype=np.int64)
    s1 = c[w - taus] - c[0]
    s2 = c[w] - c[taus]
    d = np.zeros(max_lag + 1, dtype=np.float64)
    d[1:] = s1 + s2 - 2.0 * r[1 : max_lag + 1]
    return np.maximum(d, 0.0)


def _yin_frame(
    frame: np.ndarray,
    sr: int,
    params: YinParams,
) -> tuple[float | None, float]:
    """Retorna (hz|None, confidence 0..1 baseado em 1 - d_norm no tau escolhido)."""
    x = frame.astype(np.float64, copy=False)
    rms = float(np.sqrt(np.mean(x * x)))
    if rms < params.min_rms:
        return None, 0.0

    min_lag = max(2, int(sr / params.fmax_hz))
    max_lag = min(len(x) - 2, int(sr / params.fmin_hz))
    if max_lag <= min_lag + 2:
        return None, 0.0

    d = _yin_difference(x, max_lag)

    # Cumulative mean normalized difference (vetorizado)
    cmnd = np.ones(max_lag + 1, dtype=np.float64)
    running = np.cumsum(d[1:])
    taus = np.arange(1, max_lag + 1, dtype=np.float64)
    np.divide(d[1:] * taus, running, out=cmnd[1:], where=running > 1e-12)

    # Absolute threshold
    tau_est = None
    for tau in range(min_lag, max_lag + 1):
        if cmnd[tau] < params.periodicity_threshold:
            while tau + 1 <= max_lag and cmnd[tau + 1] < cmnd[tau]:
                tau += 1
            tau_est = tau
            break

    if tau_est is None:
        tau_est = int(np.argmin(cmnd[min_lag : max_lag + 1]) + min_lag)
        if cmnd[tau_est] > params.periodicity_threshold * 2.5:
            return None, float(max(0.0, 1.0 - cmnd[tau_est]))

    if 1 < tau_est < max_lag:
        s0, s1, s2 = cmnd[tau_est - 1], cmnd[tau_est], cmnd[tau_est + 1]
        denom = 2.0 * (2.0 * s1 - s2 - s0)
        if abs(denom) > 1e-12:
            tau_est = tau_est + (s0 - s2) / denom

    hz = sr / float(tau_est)
    if hz < params.fmin_hz * 0.95 or hz > params.fmax_hz * 1.05:
        return None, 0.0

    conf = float(max(0.0, min(1.0, 1.0 - float(cmnd[int(round(tau_est))]))))
    return hz, conf


def adapt_params_for_duration(params: YinParams, duration_seconds: float) -> YinParams:
    """Aumenta hop em áudios longos para manter análise responsiva (< ~1–2 min CPU)."""
    hop = params.hop_length
    if duration_seconds > 180:
        hop = max(hop, 2048)
    elif duration_seconds > 90:
        hop = max(hop, 1536)
    elif duration_seconds > 45:
        hop = max(hop, 1024)
    if hop == params.hop_length:
        return params
    # dataclass replace-like
    return YinParams(
        frame_length=params.frame_length,
        hop_length=hop,
        fmin_hz=params.fmin_hz,
        fmax_hz=params.fmax_hz,
        periodicity_threshold=params.periodicity_threshold,
        min_rms=params.min_rms,
        median_smooth=params.median_smooth,
        octave_jump_ratio=params.octave_jump_ratio,
    )


def extract_f0(
    samples: np.ndarray,
    sample_rate: int,
    params: YinParams | None = None,
    *,
    adapt_duration: bool = True,
) -> list[PitchFrame]:
    params = params or YinParams()
    if sample_rate <= 0 or len(samples) == 0:
        return []

    duration = len(samples) / float(sample_rate)
    if adapt_duration:
        params = adapt_params_for_duration(params, duration)

    frame_len = min(params.frame_length, len(samples))
    hop = max(1, params.hop_length)
    frames: list[PitchFrame] = []

    for start in range(0, max(0, len(samples) - frame_len + 1), hop):
        chunk = samples[start : start + frame_len]
        t = start / sample_rate
        rms = float(np.sqrt(np.mean(chunk.astype(np.float64) ** 2)))
        hz, conf = _yin_frame(chunk, sample_rate, params)
        if hz is None:
            frames.append(
                PitchFrame(
                    time_seconds=t,
                    frequency_hz=None,
                    midi_note=None,
                    note_name=None,
                    is_valid=False,
                    confidence=conf if conf > 0 else None,
                    rms=rms,
                )
            )
        else:
            midi = hz_to_midi_float(hz)
            frames.append(
                PitchFrame(
                    time_seconds=t,
                    frequency_hz=hz,
                    midi_note=midi,
                    note_name=midi_to_note_name(midi),
                    is_valid=True,
                    confidence=conf,
                    rms=rms,
                )
            )

    frames = _flag_octave_jumps(frames, params.octave_jump_ratio)
    frames = _median_smooth(frames, params.median_smooth)
    return frames


def extract_f0_from_wav_path(path: Path, params: YinParams | None = None) -> tuple[list[PitchFrame], int]:
    samples, sr = load_wav_mono(path)
    return extract_f0(samples, sr, params), sr


def extract_f0_from_wav_bytes(data: bytes, params: YinParams | None = None) -> tuple[list[PitchFrame], int]:
    samples, sr = load_wav_bytes(data)
    return extract_f0(samples, sr, params), sr


def _flag_octave_jumps(frames: list[PitchFrame], ratio: float) -> list[PitchFrame]:
    out: list[PitchFrame] = []
    prev_hz: float | None = None
    for f in frames:
        if not f.is_valid or f.frequency_hz is None:
            out.append(f)
            prev_hz = None
            continue
        hz = f.frequency_hz
        if prev_hz is not None:
            r = max(hz, prev_hz) / max(1e-9, min(hz, prev_hz))
            if r >= ratio:
                # Salto suspeito — inválida este frame (não inventa oitava “corrigida”)
                out.append(
                    PitchFrame(
                        time_seconds=f.time_seconds,
                        frequency_hz=None,
                        midi_note=None,
                        note_name=None,
                        is_valid=False,
                        confidence=f.confidence,
                        rms=f.rms,
                    )
                )
                prev_hz = None
                continue
        out.append(f)
        prev_hz = hz
    return out


def _median_smooth(frames: list[PitchFrame], window: int) -> list[PitchFrame]:
    if window < 3 or window % 2 == 0:
        return frames
    half = window // 2
    hz_series = [f.frequency_hz if f.is_valid else None for f in frames]
    out: list[PitchFrame] = []
    for i, f in enumerate(frames):
        if not f.is_valid or f.frequency_hz is None:
            out.append(f)
            continue
        neigh: list[float] = []
        for j in range(i - half, i + half + 1):
            if 0 <= j < len(hz_series) and hz_series[j] is not None:
                neigh.append(hz_series[j])  # type: ignore[arg-type]
        if len(neigh) < 2:
            out.append(f)
            continue
        med = float(np.median(np.asarray(neigh, dtype=np.float64)))
        midi = hz_to_midi_float(med)
        out.append(
            PitchFrame(
                time_seconds=f.time_seconds,
                frequency_hz=med,
                midi_note=midi,
                note_name=midi_to_note_name(midi),
                is_valid=True,
                confidence=f.confidence,
                rms=f.rms,
            )
        )
    return out
