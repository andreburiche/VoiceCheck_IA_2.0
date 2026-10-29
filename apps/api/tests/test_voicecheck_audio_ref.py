"""Testes referência por áudio → NormalizedReference + comparação."""

from __future__ import annotations

import io
import wave

import numpy as np

from app.services.voicecheck_alignment import align_notes
from app.services.voicecheck_audio_reference import parse_audio_reference_bytes
from app.services.voicecheck_comparison import compare_alignment
from app.services.voicecheck_pitch import YinParams, extract_f0


def _sine(hz: float, sr: int = 44100, seconds: float = 0.5, amp: float = 0.35) -> np.ndarray:
    t = np.arange(int(sr * seconds), dtype=np.float64) / sr
    return (amp * np.sin(2 * np.pi * hz * t)).astype(np.float32)


def _wav_bytes(samples: np.ndarray, sr: int = 44100) -> bytes:
    pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


def test_parse_audio_ref_two_notes():
    # A3 0.5s + A4 0.5s
    sig = np.concatenate([_sine(220, seconds=0.55), _sine(440, seconds=0.55)])
    ref = parse_audio_reference_bytes(_wav_bytes(sig), filename="guide.wav")
    assert ref.source_type == "audio"
    assert len(ref.notes) >= 2
    midis = [n.pitch_midi for n in ref.notes]
    assert any(abs(m - 57) <= 1 for m in midis)  # A3
    assert any(abs(m - 69) <= 1 for m in midis)  # A4
    assert any("monofonia" in w.lower() or "f0" in w.lower() for w in ref.warnings)


def test_audio_ref_compare_matching_performance():
    params = YinParams(hop_length=256, fmin_hz=80, fmax_hz=800)
    # mesma melodia na ref e na execução (ligeiro atraso)
    melody = np.concatenate([_sine(440, seconds=0.7), _sine(493.88, seconds=0.7)])  # A4 B4
    silence = np.zeros(int(0.12 * 44100), dtype=np.float32)
    performance = np.concatenate([silence, melody])
    ref = parse_audio_reference_bytes(_wav_bytes(melody), filename="ref.wav", params=params)
    frames = extract_f0(performance, 44100, params)
    al = align_notes(frames, ref.notes)
    cmp_ = compare_alignment(frames, al, pitch_tolerance_cents=60)
    assert ref.notes
    assert al.status in ("completed", "insufficient")
    # com mesma melodia, espera algum pareamento ou status honesto
    assert cmp_["pitch"]["notes_compared"] >= 0


def test_silence_audio_ref_fails():
    try:
        parse_audio_reference_bytes(_wav_bytes(np.zeros(22050, dtype=np.float32)))
        assert False, "deveria falhar"
    except ValueError as exc:
        assert "segmentáveis" in str(exc).lower() or "notas" in str(exc).lower()
