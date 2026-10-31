"""Rate limit por IP via Redis (fallback in-memory)."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

import redis
from fastapi import HTTPException, Request, status

from app.core.config import get_settings

settings = get_settings()

_memory: dict[str, list[float]] = defaultdict(list)
_lock = Lock()
_redis: redis.Redis | None = None


def _get_redis() -> redis.Redis | None:
    global _redis
    if _redis is not None:
        return _redis
    try:
        client = redis.Redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=0.5)
        client.ping()
        _redis = client
        return _redis
    except Exception:  # noqa: BLE001 — fallback memória
        return None


def client_ip(request: Request) -> str:
    """IP do cliente. X-Forwarded-For só é aceito vindo de proxy confiável
    (TRUSTED_PROXIES); caso contrário qualquer um forjaria o cabeçalho e
    escaparia do rate limit."""
    peer = request.client.host if request.client else "unknown"
    trusted = settings.trusted_proxy_list
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and peer in trusted:
        # Percorre da direita para a esquerda e pega o primeiro IP não confiável.
        hops = [h.strip() for h in forwarded.split(",") if h.strip()]
        for hop in reversed(hops):
            if hop not in trusted:
                return hop
    return peer


def enforce_rate_limit(request: Request, *, bucket: str, limit: int, window_sec: int, chave: str | None = None) -> None:
    """Conta por IP; com `chave`, conta por ela (ex.: hash do e-mail) — vale para qualquer IP,
    o que segura ataques distribuídos contra uma conta (credential stuffing por botnet)."""
    if limit <= 0:
        return
    ip = chave or client_ip(request)
    key = f"rl:{bucket}:{ip}"
    r = _get_redis()
    if r is not None:
        try:
            count = int(r.incr(key))
            if count == 1:
                r.expire(key, window_sec)
            if count > limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Limite de requisições excedido ({limit}/{window_sec}s). Tente novamente em breve.",
                )
            return
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001
            pass

    now = time.monotonic()
    with _lock:
        hits = [t for t in _memory[key] if now - t < window_sec]
        if len(hits) >= limit:
            _memory[key] = hits
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Limite de requisições excedido ({limit}/{window_sec}s). Tente novamente em breve.",
            )
        hits.append(now)
        _memory[key] = hits
