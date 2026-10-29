from __future__ import annotations

import io
import json
import os
import time
import uuid
import wave

import httpx
import numpy as np
import pytest

from app.services.voicecheck_enhance import EnhanceOptions, enhance_pipeline, note_name_to_midi

SR = 44100


def _voice(freqs: list[float], amps: list[float] | None = None) -> np.ndarray:
    out, ph = [], 0.0
    for i, f in enumerate(freqs):
        n = SR
        p = ph + 2 * np.pi * f * np.arange(1, n + 1) / SR
        ph = float(p[-1])
        amp = (amps or [0.4] * len(freqs))[i]
        out.append(sum((0.6 / h) * np.sin(h * p) for h in range(1, 6)) * amp)
    return np.concatenate(out).astype(np.float32)


def test_note_name_to_midi() -> None:
    assert note_name_to_midi("A4") == 69.0
    assert note_name_to_midi("C#5") == 73.0
    assert note_name_to_midi("Bb3") == 58.0
    assert note_name_to_midi("Lá4") is None


def test_options_are_sanitized() -> None:
    o = EnhanceOptions.from_dict(
        {
            "base_strength": 500,
            "scale": "x",
            "pitch_mode": "?",
            "key": "13",
            "events": [{"start_seconds": 5, "end_seconds": 1}, {"start_seconds": "a"}, "lixo",
                       {"category": "pitch_low", "start_seconds": 1, "end_seconds": 999}],
        }
    )
    assert o.base_strength == 1.0
    assert o.scale == "auto" and o.pitch_mode == "events" and o.key == 1
    assert len(o.events) == 1 and o.events[0].end == 61.0  # trecho limitado a 60 s


def test_pipeline_fixes_events_and_reports_each_one() -> None:
    x = _voice([440 * 2 ** (40 / 1200), 493.88, 523.25 * 2 ** (-35 / 1200), 587.33], [0.4, 0.4, 0.4, 0.1])
    events = [
        {"id": "a", "category": "unstable_sustained_pitch", "title": "Lá", "start_seconds": 0, "end_seconds": 1},
        {"id": "b", "category": "pitch_below_reference", "title": "Dó", "start_seconds": 2, "end_seconds": 3,
         "expected_note": "C5"},
        {"id": "c", "category": "abrupt_intensity_drop", "title": "Queda", "start_seconds": 3, "end_seconds": 4},
        {"id": "d", "category": "possible_voice_break", "title": "Quebra", "start_seconds": 1.2, "end_seconds": 1.3},
        {"id": "e", "category": "regular_vibrato", "title": "Vibrato", "start_seconds": 1, "end_seconds": 2},
    ]
    y, stats = enhance_pipeline(x, SR, EnhanceOptions.from_dict({"events": events, "scale": "chromatic"}), isolated=False)
    assert y.size == x.size
    assert float(np.max(np.abs(y))) <= 0.95
    by_id = {c["event_id"]: c for c in stats["corrections"]}
    assert by_id["a"]["fixed"] and by_id["a"]["after_cents"] < by_id["a"]["before_cents"]
    assert by_id["b"]["fixed"] and "C5" in by_id["b"]["action"]
    assert by_id["c"]["fixed"]
    assert by_id["d"]["fixed"] is False  # não inventa voz
    assert "e" not in by_id  # vibrato é ponto positivo: não mexe
    assert stats["pitch"]["after"]["in_tune_percent"] > stats["pitch"]["before"]["in_tune_percent"]


def test_pitch_off_keeps_pitch() -> None:
    x = _voice([440 * 2 ** (40 / 1200)])
    _, stats = enhance_pipeline(x, SR, EnhanceOptions.from_dict({"pitch_mode": "off"}), isolated=False)
    assert "pitch" not in stats


# --- endpoint (precisa da API no ar) ------------------------------------------

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


def _wav(x: np.ndarray) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
    return buf.getvalue()


def test_enhance_job_endpoint_without_isolation() -> None:
    c = httpx.Client(base_url=BASE, timeout=60.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    reg = c.post(
        "/api/v1/auth/register",
        json={"email": f"en_{uuid.uuid4().hex[:8]}@example.com", "password": "senha12345", "name": "EN"},
    )
    assert reg.status_code == 201
    c.cookies.update(reg.cookies)
    c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]
    opts = {"isolate": False, "events": [{"id": "a", "category": "unstable_sustained_pitch", "title": "Lá",
                                         "start_seconds": 0, "end_seconds": 1}]}
    r = c.post(
        "/api/v1/voicecheck/enhance",
        files={"file": ("prepared.wav", io.BytesIO(_wav(_voice([440 * 2 ** (40 / 1200)]))), "audio/wav")},
        data={"options": json.dumps(opts)},
    )
    assert r.status_code == 202, r.text
    job = r.json()["job_id"]
    st = {}
    for _ in range(60):
        resp = c.get(f"/api/v1/voicecheck/enhance/{job}")
        assert resp.status_code == 200, resp.text
        st = resp.json()
        if st["state"] in {"done", "failed"}:
            break
        time.sleep(0.5)
    assert st["state"] == "done", st
    assert st["stats"]["corrections"][0]["fixed"] is True
    audio = c.get(f"/api/v1/voicecheck/enhance/{job}/audio")
    assert audio.status_code == 200 and audio.content[:4] == b"RIFF"
    assert c.delete(f"/api/v1/voicecheck/enhance/{job}").status_code == 204
    assert c.get(f"/api/v1/voicecheck/enhance/{job}").status_code == 404
    # Job de outra pessoa não aparece
    assert c.get(f"/api/v1/voicecheck/enhance/{uuid.uuid4()}").status_code == 404


def test_isolate_only_job_outputs_just_the_voice(tmp_path) -> None:
    from pathlib import Path

    from app.services.voicecheck_enhance_job import read_job, run_enhance_job, update_job

    voice = _voice([440.0, 523.25])
    mix = voice + 0.2 * np.sin(2 * np.pi * 110 * np.arange(voice.size) / SR).astype(np.float32)
    (tmp_path / "input.wav").write_bytes(_wav(mix))
    (tmp_path / "options.json").write_text(json.dumps({"mode": "isolate"}))
    update_job(tmp_path, kind="enhance", state="queued")

    def fake_isolate(src: Path, work: Path) -> Path:  # simula o Demucs
        out = work / "vocals_mono.wav"
        out.write_bytes(_wav(voice))
        return out

    run_enhance_job(tmp_path, isolate_fn=fake_isolate)
    meta = read_job(tmp_path)
    assert meta["state"] == "done", meta
    assert meta["stats"]["mode"] == "isolate" and meta["stats"]["isolated"] is True
    with wave.open(str(tmp_path / "output.wav")) as wf:
        assert wf.getnframes() == mix.size


def test_isolate_only_without_worker_fails_clearly(tmp_path) -> None:
    from app.services.voicecheck_enhance_job import read_job, run_enhance_job, update_job

    (tmp_path / "input.wav").write_bytes(_wav(_voice([440.0])))
    (tmp_path / "options.json").write_text(json.dumps({"mode": "isolate"}))
    update_job(tmp_path, kind="enhance", state="queued")
    run_enhance_job(tmp_path, isolate_fn=None)
    meta = read_job(tmp_path)
    assert meta["state"] == "failed" and "indisponível" in meta["error"]
