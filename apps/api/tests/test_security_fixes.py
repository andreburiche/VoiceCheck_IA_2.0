"""Testes offline das correções de segurança (sem API/DB no ar)."""

from __future__ import annotations

import pytest
from starlette.requests import Request

from app.api.v1.audio_assets import _content_disposition
from app.core import rate_limit
from app.core.config import Settings


def _request(peer: str, xff: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234)})


def test_xff_ignored_without_trusted_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rate_limit, "settings", Settings(trusted_proxies=""))
    assert rate_limit.client_ip(_request("203.0.113.9", "1.2.3.4")) == "203.0.113.9"


def test_xff_used_only_from_trusted_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rate_limit, "settings", Settings(trusted_proxies="10.0.0.1"))
    # proxy confiável: pega o último IP não confiável da cadeia
    assert rate_limit.client_ip(_request("10.0.0.1", "6.6.6.6, 198.51.100.7")) == "198.51.100.7"
    # conexão direta de outro IP: XFF ignorado
    assert rate_limit.client_ip(_request("198.51.100.8", "1.2.3.4")) == "198.51.100.8"


def test_production_rejects_example_secrets() -> None:
    with pytest.raises(ValueError, match="insegura"):
        Settings(
            app_env="production",
            jwt_secret="change_me_to_a_long_random_secret_at_least_32_chars",
            csrf_secret="change_me_csrf_secret_also_long_random",
            cookie_secure=True,
        )


def test_production_accepts_strong_config() -> None:
    s = Settings(
        app_env="production",
        jwt_secret="x" * 40,
        csrf_secret="y" * 40,
        cookie_secure=True,
        allow_contract_stems=False,
        storage_backend="local",
    )
    assert s.is_production
    assert not s.seed_dev_users


@pytest.mark.parametrize("env,expected", [("development", True), ("test", True), ("staging", False)])
def test_dev_users_only_in_dev_envs(env: str, expected: bool) -> None:
    assert Settings(app_env=env).seed_dev_users is expected


def test_content_disposition_is_sanitized() -> None:
    header = _content_disposition('a"b;\r\nc música.wav')
    assert "\r" not in header and "\n" not in header
    assert 'filename="a_b___c m_sica.wav"' in header
    assert "filename*=UTF-8''" in header
