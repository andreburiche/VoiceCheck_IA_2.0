"""Helpers httpx sem cookies= por request (evita DeprecationWarning)."""

from __future__ import annotations

import httpx


def apply_auth_cookies(client: httpx.Client, cookies: httpx.Cookies | dict) -> None:
    if isinstance(cookies, dict):
        client.cookies.update(cookies)
    else:
        client.cookies.update(cookies)
