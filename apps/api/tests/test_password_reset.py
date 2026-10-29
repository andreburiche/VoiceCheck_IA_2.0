from __future__ import annotations

import os
import time
import uuid
from urllib.parse import parse_qs, urlparse

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
    return c


def _register(c: httpx.Client) -> str:
    email = f"reset_{uuid.uuid4().hex[:8]}@example.com"
    r = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": "Reset"})
    assert r.status_code == 201, r.text
    c.cookies.update(r.cookies)
    return email


def test_forgot_unknown_email_is_generic(client: httpx.Client) -> None:
    r = client.post("/api/v1/auth/password/forgot", json={"email": f"nao_{uuid.uuid4().hex[:6]}@example.com"})
    assert r.status_code == 202
    assert "Se houver uma conta" in r.json()["message"]
    assert r.json().get("dev_reset_url") is None


def test_reset_flow(client: httpx.Client) -> None:
    email = _register(client)
    assert client.get("/api/v1/users/me").status_code == 200

    r = client.post("/api/v1/auth/password/forgot", json={"email": email})
    assert r.status_code == 202
    url = r.json().get("dev_reset_url")
    if not url:
        pytest.skip("SMTP configurado (sem link de dev)")
    token = parse_qs(urlparse(url).query)["token"][0]

    # Segundo pedido invalida o primeiro link
    r2 = client.post("/api/v1/auth/password/forgot", json={"email": email})
    token2 = parse_qs(urlparse(r2.json()["dev_reset_url"]).query)["token"][0]
    bad = client.post("/api/v1/auth/password/reset", json={"token": token, "password": "novasenha123"})
    assert bad.status_code == 400

    time.sleep(1.5)
    ok = client.post("/api/v1/auth/password/reset", json={"token": token2, "password": "novasenha123"})
    assert ok.status_code == 200, ok.text

    # Sessão antiga encerrada
    assert client.get("/api/v1/users/me").status_code == 401
    # Link não pode ser reutilizado
    again = client.post("/api/v1/auth/password/reset", json={"token": token2, "password": "outrasenha123"})
    assert again.status_code == 400

    fresh = httpx.Client(base_url=BASE, timeout=30.0)
    assert fresh.post("/api/v1/auth/login", json={"email": email, "password": "senha12345"}).status_code == 401
    assert fresh.post("/api/v1/auth/login", json={"email": email, "password": "novasenha123"}).status_code == 200


def test_reset_rejects_short_password(client: httpx.Client) -> None:
    r = client.post("/api/v1/auth/password/reset", json={"token": "x" * 43, "password": "123"})
    assert r.status_code == 422
