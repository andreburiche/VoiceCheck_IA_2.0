from __future__ import annotations

import os
import uuid

import httpx
import pytest

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


@pytest.fixture
def client() -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=30.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    email = f"prac_{uuid.uuid4().hex[:8]}@example.com"
    reg = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": "Prac"})
    assert reg.status_code == 201
    c.cookies.update(reg.cookies)
    c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]
    return c


def test_practice_session_and_bpm(client: httpx.Client) -> None:
    c = client
    project = c.post("/api/v1/projects", json={"name": "Treino"})
    assert project.status_code == 201
    pid = project.json()["id"]

    patch = c.patch(f"/api/v1/projects/{pid}", json={"bpm": 96, "musical_key": "Em"})
    assert patch.status_code == 200
    assert float(patch.json()["bpm"]) == 96
    assert patch.json()["musical_key"] == "Em"

    session = c.post(
        f"/api/v1/projects/{pid}/practice-sessions",
        json={
            "profile": "singer",
            "duration_sec": 120,
            "metronome_bpm": 96,
            "notes": "verso",
            "speed_pct": 75,
        },
    )
    assert session.status_code == 201, session.text
    assert session.json()["profile"] == "singer"
    assert session.json()["speed_pct"] == 75

    listed = c.get(f"/api/v1/projects/{pid}/practice-sessions")
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1
