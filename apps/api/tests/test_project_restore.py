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
    email = f"restore_{uuid.uuid4().hex[:8]}@example.com"
    reg = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": "Restore"})
    assert reg.status_code == 201, reg.text
    c.cookies.update(reg.cookies)
    c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]
    return c


def test_delete_then_restore(client: httpx.Client) -> None:
    pid = client.post("/api/v1/projects", json={"name": "Desfazer"}).json()["id"]
    assert client.delete(f"/api/v1/projects/{pid}").status_code == 204
    assert all(p["id"] != pid for p in client.get("/api/v1/projects").json()["items"])

    r = client.post(f"/api/v1/projects/{pid}/restore")
    assert r.status_code == 200, r.text
    assert any(p["id"] == pid for p in client.get("/api/v1/projects").json()["items"])


def test_restore_other_user_project_is_404(client: httpx.Client) -> None:
    r = client.post(f"/api/v1/projects/{uuid.uuid4()}/restore")
    assert r.status_code == 404
