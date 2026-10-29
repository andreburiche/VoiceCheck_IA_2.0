from __future__ import annotations

import io
import os
import struct
import uuid

import httpx
import pytest

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


def _register(c: httpx.Client, prefix: str) -> None:
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    reg = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": prefix})
    assert reg.status_code == 201, reg.text
    c.cookies.update(reg.cookies)
    c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]


@pytest.fixture
def client() -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=30.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    _register(c, "vcdiag")
    return c


def _tiny_wav() -> bytes:
    sr, n = 8000, 800
    data = b"".join(struct.pack("<h", 0) for _ in range(n))
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, sr, sr * 2, 2, 16
    ) + b"data" + struct.pack("<I", len(data))
    return header + data


def test_diagnosis_lifecycle(client: httpx.Client) -> None:
    c = client
    did = str(uuid.uuid4())
    body = {
        "title": "Aula 1",
        "step": "importar",
        "max_reached": 1,
        "asset": {"name": "aula.wav", "mime_type": "audio/wav", "size_bytes": 1600, "kind": "audio", "ext": "wav"},
    }
    r = c.put(f"/api/v1/voicecheck/diagnoses/{did}", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["has_report"] is False

    wav = _tiny_wav()
    up = c.put(
        f"/api/v1/voicecheck/diagnoses/{did}/files/original",
        files={"file": ("aula.wav", io.BytesIO(wav), "audio/wav")},
    )
    assert up.status_code == 200, up.text
    assert up.json()["has_original"] is True

    report = {"analysis_version": "t", "events": [{"id": "e1"}], "pitch_track": []}
    r2 = c.put(
        f"/api/v1/voicecheck/diagnoses/{did}",
        json={**body, "step": "resultados", "max_reached": 4, "report": report,
              "summary": {"events": 1, "positives": 0, "valid_frame_percent": 90.0}},
    )
    assert r2.status_code == 200
    assert r2.json()["has_report"] is True

    # Atualização sem "report" não apaga o relatório
    r3 = c.put(f"/api/v1/voicecheck/diagnoses/{did}", json={**body, "title": "Aula 1 (revisada)"})
    assert r3.status_code == 200
    full = c.get(f"/api/v1/voicecheck/diagnoses/{did}")
    assert full.status_code == 200
    assert full.json()["title"] == "Aula 1 (revisada)"
    assert full.json()["report"]["events"][0]["id"] == "e1"

    listed = c.get("/api/v1/voicecheck/diagnoses")
    assert listed.status_code == 200
    assert [i["id"] for i in listed.json()["items"]] == [did]

    got = c.get(f"/api/v1/voicecheck/diagnoses/{did}/files/original")
    assert got.status_code == 200
    assert got.content == wav

    missing = c.get(f"/api/v1/voicecheck/diagnoses/{did}/files/prepared")
    assert missing.status_code == 404

    # Versão afinada (autotune) com os ajustes usados
    corr = c.put(
        f"/api/v1/voicecheck/diagnoses/{did}/files/corrected",
        files={"file": ("autotune.wav", io.BytesIO(wav), "audio/wav")},
    )
    assert corr.status_code == 200, corr.text
    assert corr.json()["has_corrected"] is True
    at = c.put(
        f"/api/v1/voicecheck/diagnoses/{did}",
        json={**body, "title": "Aula 1 (revisada)", "autotune": {"key": "auto", "strength": 80}},
    )
    assert at.json()["autotune"]["strength"] == 80
    mixed = c.put(
        f"/api/v1/voicecheck/diagnoses/{did}",
        json={**body, "title": "Aula 1 (revisada)", "voice_mix": {"reverb": {"enabled": True, "mix": 0.3}}},
    )
    assert mixed.status_code == 200
    assert c.get(f"/api/v1/voicecheck/diagnoses/{did}").json()["voice_mix"]["reverb"]["mix"] == 0.3
    dropped = c.delete(f"/api/v1/voicecheck/diagnoses/{did}/files/corrected")
    assert dropped.status_code == 200
    assert dropped.json()["has_corrected"] is False
    assert dropped.json()["autotune"] is None

    d = c.delete(f"/api/v1/voicecheck/diagnoses/{did}")
    assert d.status_code == 204
    assert c.get(f"/api/v1/voicecheck/diagnoses/{did}").status_code == 404


def test_diagnosis_is_private(client: httpx.Client) -> None:
    did = str(uuid.uuid4())
    r = client.put(f"/api/v1/voicecheck/diagnoses/{did}", json={"title": "Meu"})
    assert r.status_code == 200

    other = httpx.Client(base_url=BASE, timeout=30.0)
    _register(other, "vcother")
    assert other.get(f"/api/v1/voicecheck/diagnoses/{did}").status_code == 404
    assert other.put(f"/api/v1/voicecheck/diagnoses/{did}", json={"title": "Roubado"}).status_code == 404
    assert other.delete(f"/api/v1/voicecheck/diagnoses/{did}").status_code == 404
    assert other.get("/api/v1/voicecheck/diagnoses").json()["items"] == []


def test_diagnosis_rejects_bad_input(client: httpx.Client) -> None:
    assert client.get("/api/v1/voicecheck/diagnoses/nao-e-uuid").status_code == 404
    did = str(uuid.uuid4())
    assert client.put(f"/api/v1/voicecheck/diagnoses/{did}", json={"title": ""}).status_code == 422
    client.put(f"/api/v1/voicecheck/diagnoses/{did}", json={"title": "x"})
    bad = client.put(
        f"/api/v1/voicecheck/diagnoses/{did}/files/original",
        files={"file": ("virus.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
    )
    assert bad.status_code == 400
    no_csrf = httpx.Client(base_url=BASE, cookies=client.cookies, timeout=30.0)
    assert no_csrf.put(f"/api/v1/voicecheck/diagnoses/{did}", json={"title": "y"}).status_code == 403
