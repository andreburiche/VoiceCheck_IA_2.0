from __future__ import annotations

import io
import json
import os
import uuid
import wave

import httpx
import numpy as np
import pytest

from app.services.voicecheck_autotune import (
    AutotuneParams,
    autotune_samples,
    autotune_wav_bytes,
    detect_key,
    snap_to_scale,
)
from app.services.voicecheck_pitch import YinParams, extract_f0

SR = 44100


def _voice(freqs: list[float], dur: float = 1.0) -> np.ndarray:
    out = []
    ph = 0.0
    for f in freqs:
        n = int(SR * dur)
        t = np.arange(n)
        inst = f * (1 + 0.003 * np.sin(2 * np.pi * 5 * t / SR))
        phase = ph + 2 * np.pi * np.cumsum(inst) / SR
        ph = float(phase[-1])
        out.append(sum((0.6 / h) * np.sin(h * phase) for h in range(1, 6)) * 0.4)
    return np.concatenate(out).astype(np.float32)


def _cents_off(y: np.ndarray, start: float, end: float) -> float:
    frames = extract_f0(y, SR, YinParams(hop_length=1024), adapt_duration=False)
    vals = [
        (f.midi_note - round(f.midi_note)) * 100
        for f in frames
        if f.is_valid and f.midi_note is not None and start <= f.time_seconds <= end
    ]
    return float(np.median(vals))


def test_snap_to_scale_major() -> None:
    # Dó maior: notas fora da escala vão para a vizinha mais próxima da escala
    out = snap_to_scale(np.array([60.4, 61.6, 64.2, 66.4]), 0, "major")
    assert list(out) == [60.0, 62.0, 64.0, 67.0]


def test_detect_key_c_major() -> None:
    midis = np.array([60, 62, 64, 65, 67, 69, 71, 72] * 10, dtype=float)
    key, scale, conf = detect_key(midis)
    assert (key, scale) == (0, "major")
    assert conf > 0.5


def test_autotune_pulls_notes_to_pitch() -> None:
    sung = [440 * 2 ** (40 / 1200), 523.25 * 2 ** (-30 / 1200)]  # Lá4 +40¢, Dó5 −30¢
    x = _voice(sung)
    y, stats = autotune_samples(x, SR, AutotuneParams(scale="chromatic", strength=1.0, retune_ms=10))
    assert len(y) == len(x)  # mesma duração
    assert abs(_cents_off(y, 0.2, 0.8)) < 12
    assert abs(_cents_off(y, 1.2, 1.8)) < 12
    assert stats["after"]["mean_abs_cents"] < stats["before"]["mean_abs_cents"]
    assert stats["after"]["in_tune_percent"] > stats["before"]["in_tune_percent"]


def test_note_sung_between_semitones_settles_on_one() -> None:
    # Mi5 +45¢ fica quase no meio de Mi5 e Fá5: não pode oscilar entre os dois.
    x = _voice([659.25 * 2 ** (45 / 1200)])
    y, _ = autotune_samples(x, SR, AutotuneParams(retune_ms=30))
    assert abs(_cents_off(y, 0.2, 0.8)) < 15


def test_strength_zero_keeps_pitch() -> None:
    x = _voice([440 * 2 ** (40 / 1200)])
    y, _ = autotune_samples(x, SR, AutotuneParams(strength=0.0))
    assert abs(_cents_off(y, 0.2, 0.8) - 40) < 10


def test_humanize_keeps_small_deviation() -> None:
    x = _voice([440 * 2 ** (10 / 1200)])
    y, _ = autotune_samples(x, SR, AutotuneParams(humanize_cents=20))
    assert abs(_cents_off(y, 0.2, 0.8) - 10) < 8


def test_rejects_silence() -> None:
    with pytest.raises(ValueError):
        autotune_samples(np.zeros(SR, dtype=np.float32), SR, AutotuneParams())


def _wav_bytes(x: np.ndarray) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    return buf.getvalue()


def test_autotune_wav_roundtrip() -> None:
    res = autotune_wav_bytes(_wav_bytes(_voice([440 * 2 ** (35 / 1200)])), AutotuneParams())
    assert res.wav_bytes[:4] == b"RIFF"
    assert res.stats["after"]["in_tune_percent"] >= 80


# --- endpoint (precisa da API no ar) -------------------------------------------

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


def test_autotune_endpoint() -> None:
    c = httpx.Client(base_url=BASE, timeout=120.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    reg = c.post(
        "/api/v1/auth/register",
        json={"email": f"at_{uuid.uuid4().hex[:8]}@example.com", "password": "senha12345", "name": "AT"},
    )
    assert reg.status_code == 201
    c.cookies.update(reg.cookies)
    c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]
    wav = _wav_bytes(_voice([440 * 2 ** (40 / 1200)]))
    r = c.post(
        "/api/v1/voicecheck/autotune",
        files={"file": ("prepared.wav", io.BytesIO(wav), "audio/wav")},
        data={"key": "auto", "scale": "chromatic", "strength": "100", "retune_ms": "20"},
    )
    assert r.status_code == 200, r.text
    assert r.content[:4] == b"RIFF"
    stats = json.loads(r.headers["X-Autotune-Stats"])
    assert stats["after"]["mean_abs_cents"] < stats["before"]["mean_abs_cents"]
    bad = c.post(
        "/api/v1/voicecheck/autotune",
        files={"file": ("x.wav", io.BytesIO(b"nope"), "audio/wav")},
    )
    assert bad.status_code == 400
