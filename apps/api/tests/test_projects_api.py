"""Testes de integração leves contra a API em Docker (se disponível).

Rode com: pytest tests/test_projects_api.py
Requer API em PUBLIC_API_URL (default localhost:8000).
"""

from __future__ import annotations

import hashlib
import os
import uuid

import httpx
import pytest

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


def _client() -> httpx.Client:
    return httpx.Client(base_url=BASE, timeout=30.0, follow_redirects=True)


@pytest.fixture(scope="module")
def auth_session() -> dict:
    email = f"fase2_{uuid.uuid4().hex[:8]}@example.com"
    password = "senha12345"
    with _client() as c:
        try:
            r = c.get("/health")
        except httpx.ConnectError:
            pytest.skip("API indisponível")
        if r.status_code != 200:
            pytest.skip("API indisponível")

        reg = c.post(
            "/api/v1/auth/register",
            json={"email": email, "password": password, "name": "Fase Dois"},
        )
        assert reg.status_code == 201, reg.text
        csrf = reg.json()["csrf_token"]
        cookies = dict(reg.cookies)
        return {"cookies": cookies, "csrf": csrf, "email": email, "password": password}


def test_project_crud_and_ownership(auth_session: dict) -> None:
    with _client() as c:
        c.cookies.update(auth_session["cookies"])
        headers = {"X-CSRF-Token": auth_session["csrf"]}
        created = c.post(
            "/api/v1/projects",
            json={"name": "Meu Projeto", "description": "teste"},
            headers=headers,
        )
        assert created.status_code == 201, created.text
        project = created.json()
        pid = project["id"]

        listed = c.get("/api/v1/projects")
        assert listed.status_code == 200
        assert any(p["id"] == pid for p in listed.json()["items"])

        # segundo usuário não acessa
        other_email = f"other_{uuid.uuid4().hex[:8]}@example.com"
        other = c.post(
            "/api/v1/auth/register",
            json={"email": other_email, "password": "senha12345", "name": "Outro"},
        )
        assert other.status_code == 201
        with _client() as other_client:
            other_client.cookies.update(other.cookies)
            denied = other_client.get(f"/api/v1/projects/{pid}")
            assert denied.status_code == 403


def test_upload_wav_flow(auth_session: dict) -> None:
    n = 4000
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
    data = bytes(wav)
    checksum = hashlib.sha256(data).hexdigest()

    with _client() as c:
        c.cookies.update(auth_session["cookies"])
        headers = {"X-CSRF-Token": auth_session["csrf"]}
        project = c.post(
            "/api/v1/projects",
            json={"name": "Upload Proj"},
            headers=headers,
        )
        assert project.status_code == 201, project.text
        pid = project.json()["id"]

        init = c.post(
            "/api/v1/uploads/initiate",
            json={
                "project_id": pid,
                "filename": "silence.wav",
                "mime_type": "audio/wav",
                "size_bytes": len(data),
                "checksum_sha256": checksum,
                "rights_confirmed": True,
            },
            headers=headers,
        )
        assert init.status_code == 201, init.text
        body = init.json()
        put = c.put(body["upload_url"], content=data, headers={"Content-Type": "audio/wav"})
        assert put.status_code == 204, put.text

        done = c.post(
            "/api/v1/uploads/complete",
            json={"asset_id": body["asset_id"], "checksum_sha256": checksum},
            headers=headers,
        )
        assert done.status_code == 200, done.text
        asset = done.json()
        assert asset["status"] == "ready"
        assert asset["format"] == "wav"

        play = c.get(f"/api/v1/audio-assets/{asset['id']}/playback-url")
        assert play.status_code == 200
        assert "url" in play.json()
