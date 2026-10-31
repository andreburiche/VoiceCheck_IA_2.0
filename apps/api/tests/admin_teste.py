"""Sessão do administrador de teste (seed em APP_ENV=test), reaproveitada entre os testes.

O login tem limite por conta (10 a cada 15 min): por isso uma única sessão para a bateria toda.
"""

from __future__ import annotations

import os

import httpx
import pytest

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")
_ADMIN: list[httpx.Client] = []


def admin() -> httpx.Client:
    if not _ADMIN:
        c = httpx.Client(base_url=BASE, timeout=60.0)
        r = c.post("/api/v1/auth/login", json={"email": "admin@estudio.local", "password": "senha12345"})
        if r.status_code != 200:
            pytest.skip("conta de teste do administrador indisponível")
        c.cookies.update(r.cookies)
        c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
        _ADMIN.append(c)
    return _ADMIN[0]


def aprovar_fono(usuario_id: str, aprovar: bool = True, nota: str | None = None) -> httpx.Response:
    r = admin().post(f"/api/v1/admin/usuarios/{usuario_id}/verificacao-clinica", json={"aprovar": aprovar, "nota": nota})
    assert r.status_code == 200, r.text
    return r
