from __future__ import annotations

import hashlib
import os
import time
import uuid

import httpx
import pytest

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


def _wav(n: int = 4000) -> bytes:
    pcm = bytes(n)
    wav = bytearray()
    wav.extend(b"RIFF")
    wav.extend((36 + n).to_bytes(4, "little"))
    wav.extend(b"WAVE")
    wav.extend(b"fmt ")
    wav.extend((16).to_bytes(4, "little"))
    wav.extend((1).to_bytes(2, "little"))
    wav.extend((1).to_bytes(2, "little"))
    wav.extend((8000).to_bytes(4, "little"))
    wav.extend((8000).to_bytes(4, "little"))
    wav.extend((1).to_bytes(2, "little"))
    wav.extend((8).to_bytes(2, "little"))
    wav.extend(b"data")
    wav.extend((n).to_bytes(4, "little"))
    wav.extend(pcm)
    return bytes(wav)


@pytest.fixture(scope="module")
def authed() -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=90.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    email = f"studio_{uuid.uuid4().hex[:8]}@example.com"
    reg = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": "Studio"})
    assert reg.status_code == 201, reg.text
    c.cookies.update(reg.cookies)
    c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]
    return c


def _upload_and_separate(c: httpx.Client) -> tuple[str, str]:
    project = c.post("/api/v1/projects", json={"name": "Studio Proj"})
    assert project.status_code == 201
    pid = project.json()["id"]
    data = _wav()
    checksum = hashlib.sha256(data).hexdigest()
    init = c.post(
        "/api/v1/uploads/initiate",
        json={
            "project_id": pid,
            "filename": "t.wav",
            "mime_type": "audio/wav",
            "size_bytes": len(data),
            "checksum_sha256": checksum,
            "rights_confirmed": True,
        },
    )
    assert init.status_code == 201, init.text
    assert c.put(init.json()["upload_url"], content=data, headers={"Content-Type": "audio/wav"}).status_code == 204
    done = c.post(
        "/api/v1/uploads/complete",
        json={"asset_id": init.json()["asset_id"], "checksum_sha256": checksum},
    )
    assert done.status_code == 200
    sep = c.post(
        f"/api/v1/projects/{pid}/separations",
        json={"source_asset_id": done.json()["id"], "model_code": "htdemucs"},
        headers={"Idempotency-Key": f"studio-{uuid.uuid4()}"},
    )
    assert sep.status_code == 201, sep.text
    job_id = sep.json()["id"]
    for _ in range(40):
        job = c.get(f"/api/v1/processing-jobs/{job_id}").json()
        if job["status"] == "completed":
            return pid, job_id
        if job["status"] in {"failed", "cancelled"}:
            pytest.skip(f"separação não disponível: {job.get('error_message')}")
        time.sleep(1)
    pytest.skip("timeout separação")


def test_mix_and_mixdown_export(authed: httpx.Client) -> None:
    c = authed
    pid, _job = _upload_and_separate(c)

    mix = c.get(f"/api/v1/projects/{pid}/mix")
    assert mix.status_code == 200
    state = mix.json()["state"]
    state["stems"]["vocals"]["volume"] = 0.5
    put = c.put(f"/api/v1/projects/{pid}/mix", json={"name": "Padrão", "state": state, "is_default": True})
    assert put.status_code == 200
    assert put.json()["version"] >= 1

    marker = c.post(
        f"/api/v1/projects/{pid}/markers",
        json={"position_ms": 100, "label": "Intro"},
    )
    assert marker.status_code == 201
    mid = marker.json()["id"]
    patched = c.patch(
        f"/api/v1/projects/{pid}/markers/{mid}",
        json={"label": "Intro editada", "position_ms": 150},
    )
    assert patched.status_code == 200
    assert patched.json()["label"] == "Intro editada"
    assert patched.json()["position_ms"] == 150

    loop = c.post(
        f"/api/v1/projects/{pid}/loop-regions",
        json={"name": "A-B", "start_ms": 0, "end_ms": 500},
    )
    assert loop.status_code == 201
    lid = loop.json()["id"]
    loop_patch = c.patch(
        f"/api/v1/projects/{pid}/loop-regions/{lid}",
        json={"name": "A-B edit", "end_ms": 800},
    )
    assert loop_patch.status_code == 200
    assert loop_patch.json()["end_ms"] == 800

    deleted_m = c.delete(f"/api/v1/projects/{pid}/markers/{mid}")
    assert deleted_m.status_code == 204
    deleted_l = c.delete(f"/api/v1/projects/{pid}/loop-regions/{lid}")
    assert deleted_l.status_code == 204

    # recria para não afetar fluxo de export
    assert (
        c.post(
            f"/api/v1/projects/{pid}/markers",
            json={"position_ms": 100, "label": "Intro"},
        ).status_code
        == 201
    )

    exp = c.post(
        f"/api/v1/projects/{pid}/exports",
        json={"kind": "mixdown", "params": {}},
        headers={"Idempotency-Key": f"exp-{uuid.uuid4()}"},
    )
    assert exp.status_code == 201, exp.text
    eid = exp.json()["id"]
    terminal = None
    for _ in range(40):
        cur = c.get(f"/api/v1/export-jobs/{eid}").json()
        if cur["status"] in {"completed", "failed"}:
            terminal = cur
            break
        time.sleep(1)
    assert terminal is not None
    assert terminal["status"] == "completed", terminal
    assert terminal["result_asset_id"]
    play = c.get(f"/api/v1/audio-assets/{terminal['result_asset_id']}/playback-url")
    assert play.status_code == 200
    assert "url" in play.json()

    # MP3 mixdown (pula se worker sem lame)
    exp_mp3 = c.post(
        f"/api/v1/projects/{pid}/exports",
        json={"kind": "mixdown", "params": {"format": "mp3"}},
        headers={"Idempotency-Key": f"exp-mp3-{uuid.uuid4()}"},
    )
    assert exp_mp3.status_code == 201, exp_mp3.text
    eid2 = exp_mp3.json()["id"]
    terminal2 = None
    for _ in range(40):
        cur = c.get(f"/api/v1/export-jobs/{eid2}").json()
        if cur["status"] in {"completed", "failed"}:
            terminal2 = cur
            break
        time.sleep(1)
    assert terminal2 is not None
    if terminal2["status"] == "failed":
        err = (terminal2.get("error_message") or "").lower()
        if "libmp3lame" in err or "mp3" in err:
            pytest.skip(f"MP3 indisponível no worker: {terminal2.get('error_message')}")
    assert terminal2["status"] == "completed", terminal2
    assert terminal2["result_asset_id"]
