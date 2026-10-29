"""Testes F0/YIN VoiceCheck com sinais sintéticos (tolerâncias mensuráveis)."""

from __future__ import annotations

import io
import wave

import numpy as np
import pytest

from app.services.voicecheck_analysis import build_analysis_report
from app.services.voicecheck_pitch import YinParams, extract_f0, extract_f0_from_wav_bytes


def _sine(hz: float, sr: int = 44100, seconds: float = 1.0, amp: float = 0.4) -> np.ndarray:
    t = np.arange(int(sr * seconds), dtype=np.float64) / sr
    return (amp * np.sin(2 * np.pi * hz * t)).astype(np.float32)


def _to_wav_bytes(samples: np.ndarray, sr: int = 44100) -> bytes:
    pcm = np.clip(samples, -1, 1)
    pcm_i16 = (pcm * 32767.0).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm_i16.tobytes())
    return buf.getvalue()


def _median_valid_hz(frames) -> float | None:
    vals = [f.frequency_hz for f in frames if f.is_valid and f.frequency_hz is not None]
    if not vals:
        return None
    return float(np.median(vals))


@pytest.fixture
def yin_params() -> YinParams:
    return YinParams(
        frame_length=2048,
        hop_length=512,
        fmin_hz=80.0,
        fmax_hz=800.0,
        periodicity_threshold=0.2,
        median_smooth=3,
    )


def test_sine_220(yin_params: YinParams):
    frames = extract_f0(_sine(220), 44100, yin_params)
    med = _median_valid_hz(frames)
    assert med is not None
    assert abs(med - 220) < 8.0  # ±8 Hz
    assert sum(1 for f in frames if f.is_valid) / len(frames) > 0.5


def test_sine_440(yin_params: YinParams):
    frames = extract_f0(_sine(440), 44100, yin_params)
    med = _median_valid_hz(frames)
    assert med is not None
    assert abs(med - 440) < 12.0


def test_step_220_to_440(yin_params: YinParams):
    a = _sine(220, seconds=0.6)
    b = _sine(440, seconds=0.6)
    frames = extract_f0(np.concatenate([a, b]), 44100, yin_params)
    first = [f.frequency_hz for f in frames if f.is_valid and f.time_seconds < 0.45]
    second = [f.frequency_hz for f in frames if f.is_valid and f.time_seconds > 0.75]
    assert first and second
    assert abs(float(np.median(first)) - 220) < 15
    assert abs(float(np.median(second)) - 440) < 20


def test_silence_not_notes(yin_params: YinParams):
    frames = extract_f0(np.zeros(44100, dtype=np.float32), 44100, yin_params)
    assert all(not f.is_valid for f in frames)
    assert all(f.frequency_hz is None for f in frames)
    assert all(f.note_name is None for f in frames)


def test_noise_low_validity(yin_params: YinParams):
    rng = np.random.default_rng(0)
    noise = (rng.standard_normal(44100).astype(np.float32) * 0.15)
    frames = extract_f0(noise, 44100, yin_params)
    valid_pct = sum(1 for f in frames if f.is_valid) / max(1, len(frames))
    assert valid_pct < 0.35


def test_vibrato_stays_near_carrier(yin_params: YinParams):
    sr = 44100
    t = np.arange(sr, dtype=np.float64) / sr
    # 220 Hz ± vibrato ±4 Hz @ 5 Hz — não deve ser tratado como “erro”
    f0 = 220 + 4 * np.sin(2 * np.pi * 5 * t)
    phase = 2 * np.pi * np.cumsum(f0) / sr
    sig = (0.35 * np.sin(phase)).astype(np.float32)
    frames = extract_f0(sig, sr, yin_params)
    med = _median_valid_hz(frames)
    assert med is not None
    assert abs(med - 220) < 12


def test_short_audio_report(yin_params: YinParams):
    frames = extract_f0(_sine(330, seconds=0.12), 44100, yin_params)
    report = build_analysis_report(
        frames, sample_rate=44100, duration_seconds=0.12, params=yin_params
    )
    assert report["analysis_version"]
    assert report["no_reference"] is True
    assert "disclaimer" in report
    assert "pitch_track" in report
    # Sem campos de erro de afinação
    assert "tuning_score" not in report
    assert "wrong_notes" not in report


def test_invalid_wav_bytes():
    with pytest.raises(Exception):
        extract_f0_from_wav_bytes(b"not-a-wav-file")


def test_wav_roundtrip_440(yin_params: YinParams):
    blob = _to_wav_bytes(_sine(440, seconds=0.8))
    frames, sr = extract_f0_from_wav_bytes(blob, yin_params)
    assert sr == 44100
    med = _median_valid_hz(frames)
    assert med is not None
    assert abs(med - 440) < 12
    report = build_analysis_report(
        frames, sample_rate=sr, duration_seconds=0.8, params=yin_params
    )
    assert report["statistics"]["valid_frames"] > 0
    for pt in report["pitch_track"]:
        if not pt["is_valid"]:
            assert pt["frequency_hz"] is None
            assert pt["note_name"] is None


def test_null_hz_never_zero_as_note(yin_params: YinParams):
    frames = extract_f0(np.zeros(8000, dtype=np.float32), 44100, yin_params)
    report = build_analysis_report(
        frames, sample_rate=44100, duration_seconds=8000 / 44100, params=yin_params
    )
    for pt in report["pitch_track"]:
        if pt["frequency_hz"] == 0:
            pytest.fail("0 Hz não deve aparecer como pitch válido")
        if not pt["is_valid"]:
            assert pt["midi_note"] is None
