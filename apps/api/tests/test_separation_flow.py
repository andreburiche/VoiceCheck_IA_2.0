"""Fluxo de separação com adapter contract (stems silenciosos de teste)."""

from __future__ import annotations

import hashlib
import os
import time
import uuid

import httpx
import pytest

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


def _wav_bytes() -> bytes:
    """WAV PCM 8-bit mono 8kHz com 0.5s de silêncio."""
    n = 4000
    data = bytes(n)
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
    wav.extend(data)
    return bytes(wav)


@pytest.fixture(scope="module")
def client_auth() -> tuple[httpx.Client, dict]:
    c = httpx.Client(base_url=BASE, timeout=60.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    email = f"sep_{uuid.uuid4().hex[:8]}@example.com"
    reg = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": "Sep"})
    assert reg.status_code == 201, reg.text
    csrf = reg.json()["csrf_token"]
    # persist cookies on client
    c.cookies.update(reg.cookies)
    return c, {"X-CSRF-Token": csrf}


def test_separation_idempotency_and_pipeline(client_auth: tuple[httpx.Client, dict]) -> None:
    c, headers = client_auth
    project = c.post("/api/v1/projects", json={"name": "Sep Proj"}, headers=headers)
    assert project.status_code == 201, project.text
    pid = project.json()["id"]

    data = _wav_bytes()
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
        headers=headers,
    )
    assert init.status_code == 201, init.text
    put = c.put(init.json()["upload_url"], content=data, headers={"Content-Type": "audio/wav"})
    assert put.status_code == 204
    done = c.post(
        "/api/v1/uploads/complete",
        json={"asset_id": init.json()["asset_id"], "checksum_sha256": checksum},
        headers=headers,
    )
    assert done.status_code == 200, done.text
    asset_id = done.json()["id"]

    idem = f"idem-{uuid.uuid4()}"
    sep1 = c.post(
        f"/api/v1/projects/{pid}/separations",
        json={"source_asset_id": asset_id, "model_code": "htdemucs"},
        headers={**headers, "Idempotency-Key": idem},
    )
    assert sep1.status_code == 201, sep1.text
    job_id = sep1.json()["id"]

    sep2 = c.post(
        f"/api/v1/projects/{pid}/separations",
        json={"source_asset_id": asset_id, "model_code": "htdemucs"},
        headers={**headers, "Idempotency-Key": idem},
    )
    assert sep2.status_code == 201
    assert sep2.json()["id"] == job_id

    # Aguarda worker (contract com ALLOW_CONTRACT_STEMS ou falha explícita)
    terminal = None
    for _ in range(40):
        job = c.get(f"/api/v1/processing-jobs/{job_id}")
        assert job.status_code == 200
        status = job.json()["status"]
        if status in {"completed", "failed", "cancelled"}:
            terminal = job.json()
            break
        time.sleep(1.5)

    assert terminal is not None, "timeout aguardando job"
    # Com ALLOW_CONTRACT_STEMS=1 → completed; sem isso → failed com INFERENCE_FAILED
    if terminal["status"] == "completed":
        stems = c.get(f"/api/v1/projects/{pid}/stems", params={"job_id": job_id})
        assert stems.status_code == 200
        assert stems.json()["total"] == 4
    else:
        assert terminal["status"] == "failed"
        assert terminal.get("error_code") in {"INFERENCE_FAILED", "PIPELINE_ERROR"}
        assert "contract" in (terminal.get("error_message") or "").lower() or "demucs" in (
            terminal.get("error_message") or ""
        ).lower()
