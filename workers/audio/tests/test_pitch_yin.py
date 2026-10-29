import math
import wave
from pathlib import Path

import numpy as np

from worker.pipeline.pitch_yin import estimate_notes, estimate_notes_from_wav, hz_to_midi


def test_hz_to_midi_a4():
    assert hz_to_midi(440.0) == 69


def test_estimate_sine_a4(tmp_path: Path):
    sr = 22050
    dur = 1.0
    t = np.arange(int(sr * dur)) / sr
    samples = (0.3 * np.sin(2 * math.pi * 440 * t)).astype(np.float32)
    notes = estimate_notes(samples, sr, hop_sec=0.05)
    assert notes, "deveria detectar nota"
    midis = {n["pitch_midi"] for n in notes}
    assert 69 in midis or 68 in midis or 70 in midis

    wav = tmp_path / "a4.wav"
    pcm = (samples * 32767).astype(np.int16)
    with wave.open(str(wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())
    from_file = estimate_notes_from_wav(wav)
    assert from_file
