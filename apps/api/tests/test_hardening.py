from __future__ import annotations

import os
import uuid

import httpx
import pytest

from app.core.security import generate_csrf_token, is_valid_csrf_token

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


@pytest.fixture
def client() -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=30.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    email = f"hard_{uuid.uuid4().hex[:8]}@example.com"
    reg = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": "Hard"})
    assert reg.status_code == 201, reg.text
    c.cookies.update(reg.cookies)
    c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]
    return c


def test_csrf_token_is_signed() -> None:
    token = generate_csrf_token()
    assert is_valid_csrf_token(token)
    assert not is_valid_csrf_token("nao-assinado")
    assert not is_valid_csrf_token(token + "x")


def test_mutation_without_csrf_forbidden(client: httpx.Client) -> None:
    bare = httpx.Client(base_url=BASE, cookies=client.cookies, timeout=30.0)
    try:
        r = bare.post("/api/v1/projects", json={"name": "Sem CSRF"})
        assert r.status_code == 403
    finally:
        bare.close()


def test_security_headers_on_health() -> None:
    try:
        r = httpx.get(f"{BASE}/health", timeout=10.0)
    except httpx.ConnectError:
        pytest.skip("API down")
    assert r.status_code == 200
    assert r.headers.get("x-content-type-options") == "nosniff"
    assert r.headers.get("x-frame-options") == "DENY"


def test_system_status_requires_auth() -> None:
    try:
        r = httpx.get(f"{BASE}/api/v1/system/status", timeout=10.0)
    except httpx.ConnectError:
        pytest.skip("API down")
    assert r.status_code == 401


def test_system_status_authenticated(client: httpx.Client) -> None:
    r = client.get("/api/v1/system/status")
    assert r.status_code == 200
    body = r.json()
    assert "separation_adapter" in body
    assert "using_contract_silence" in body
    assert "storage_backend" in body
    assert "cpu_count" in body
    assert "gpu_available" in body
    assert "disk_free_bytes" in body
    assert "models" in body
    assert isinstance(body["models"], list)
    assert any(m.get("code") == "htdemucs" for m in body["models"])
    assert "max_upload_bytes" in body
