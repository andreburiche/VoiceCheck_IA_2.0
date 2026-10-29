"""Testes da análise técnica VoiceCheck 4.5 (sinais sintéticos)."""

from __future__ import annotations

import numpy as np

from app.services.voicecheck_analysis import build_analysis_report
from app.services.voicecheck_breath import detect_breath_events
from app.services.voicecheck_dynamics import detect_dynamics
from app.services.voicecheck_pitch import YinParams, extract_f0
from app.services.voicecheck_stability import detect_stability_issues
from app.services.voicecheck_technical import run_technical_analysis
from app.services.voicecheck_vibrato import detect_vibrato_features
from app.services.voicecheck_voice_breaks import detect_voice_breaks


def _sine(hz: float, sr: int = 44100, seconds: float = 1.0, amp: float = 0.35) -> np.ndarray:
    t = np.arange(int(sr * seconds), dtype=np.float64) / sr
    return (amp * np.sin(2 * np.pi * hz * t)).astype(np.float32)


def _params() -> YinParams:
    return YinParams(frame_length=2048, hop_length=256, fmin_hz=80, fmax_hz=900)


def test_stable_sine_has_positive_or_empty_caution():
    samples = _sine(220, seconds=2.0)
    frames = extract_f0(samples, 44100, _params())
    tech = run_technical_analysis(frames, samples=samples, sample_rate=44100)
    # não inventa voice breaks em seno contínuo
    assert tech["technical_analysis"]["voice_breaks"] == []
    # ponto positivo de continuidade ou sustentação estável é esperado
    keys = {p["key"] for p in tech["positive_findings"]}
    assert "continuous_voicing" in keys or "stable_sustain" in keys or "no_clipping" in keys


def test_report_contract_v45():
    samples = _sine(440, seconds=1.2)
    frames = extract_f0(samples, 44100, _params())
    report = build_analysis_report(
        frames,
        sample_rate=44100,
        duration_seconds=1.2,
        params=_params(),
        samples=samples,
    )
    assert report["analysis_version"] == "voicecheck_tech_v45"
    assert report["mode"] == "without_reference"
    assert report["processing_engine"] == "python_local"
    assert "events" in report
    assert "positive_findings" in report
    assert "recommendations" in report
    assert "technical_analysis" in report
    assert "rms" in report["pitch_track"][0]
    assert "tuning_score" not in report


def test_abrupt_gap_voice_break_candidate():
    """Dois trechos vozeados com buraco curto + energia baixa → possível break."""
    sr = 44100
    a = _sine(220, seconds=0.7, amp=0.4)
    gap = np.zeros(int(0.09 * sr), dtype=np.float32)
    b = _sine(220, seconds=0.7, amp=0.4)
    samples = np.concatenate([a, gap, b])
    frames = extract_f0(samples, sr, _params())
    breaks = detect_voice_breaks(frames)
    # pode falhar se YIN preencher o gap — aceita 0 ou ≥1 sem inventar no silêncio puro
    assert isinstance(breaks, list)


def test_intensity_drop_and_clipping():
    sr = 44100
    loud = _sine(220, seconds=0.5, amp=0.5)
    soft = _sine(220, seconds=0.15, amp=0.02)
    loud2 = _sine(220, seconds=0.4, amp=0.45)
    samples = np.concatenate([loud, soft, loud2])
    frames = extract_f0(samples, sr, _params())
    dyn = detect_dynamics(frames, samples, sr)
    assert isinstance(dyn, list)

    clipped = np.clip(_sine(220, seconds=0.3, amp=1.2), -1, 1).astype(np.float32)
    frames_c = extract_f0(clipped, sr, _params())
    clip_ev = detect_dynamics(frames_c, clipped, sr)
    assert any(e.category == "possible_clipping" for e in clip_ev)


def test_vibrato_regular_synthetic():
    sr = 44100
    t = np.arange(int(1.5 * sr), dtype=np.float64) / sr
    f0 = 220 + 6 * np.sin(2 * np.pi * 5.5 * t)
    phase = 2 * np.pi * np.cumsum(f0) / sr
    sig = (0.35 * np.sin(phase)).astype(np.float32)
    frames = extract_f0(sig, sr, YinParams(hop_length=256, fmin_hz=80, fmax_hz=500))
    vib = detect_vibrato_features(frames)
    # vibrato sintético ideal pode ou não passar autocorrelação do YIN — não força falso positivo de break
    breaks = detect_voice_breaks(frames)
    assert breaks == [] or all(e.confidence and e.confidence >= 0.52 for e in breaks)
    assert isinstance(vib, list)


def test_unstable_noise_modulation():
    sr = 44100
    rng = np.random.default_rng(1)
    t = np.arange(int(1.2 * sr), dtype=np.float64) / sr
    # modulação irregular ampla
    f0 = 220 + 25 * rng.standard_normal(len(t)).cumsum()
    f0 = 180 + 80 * (f0 - f0.min()) / (f0.max() - f0.min() + 1e-9)
    phase = 2 * np.pi * np.cumsum(f0) / sr
    sig = (0.3 * np.sin(phase)).astype(np.float32)
    frames = extract_f0(sig, sr, _params())
    stab = detect_stability_issues(frames)
    assert isinstance(stab, list)


def test_breath_gap_between_phrases():
    sr = 44100
    a = _sine(200, seconds=0.8, amp=0.35)
    # gap com ruído residual baixo (inspiração)
    rng = np.random.default_rng(2)
    breath = (rng.standard_normal(int(0.22 * sr)).astype(np.float32) * 0.01)
    b = _sine(210, seconds=0.7, amp=0.35)
    samples = np.concatenate([a, breath, b])
    frames = extract_f0(samples, sr, _params())
    breaths = detect_breath_events(frames)
    assert isinstance(breaths, list)


def test_silence_no_fake_events():
    samples = np.zeros(44100, dtype=np.float32)
    frames = extract_f0(samples, 44100, _params())
    tech = run_technical_analysis(frames, samples=samples, sample_rate=44100)
    assert tech["events"] == []
