from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from typing import Any

import redis


def _client() -> redis.Redis:
    url = os.getenv("REDIS_URL") or os.getenv("CELERY_BROKER_URL") or "redis://127.0.0.1:6379/0"
    return redis.Redis.from_url(url, decode_responses=True)


def publish(job_id: str, event: dict[str, Any]) -> None:
    payload = {"job_id": job_id, "ts": datetime.now(UTC).isoformat(), **event}
    r = _client()
    r.publish(f"job:{job_id}:events", json.dumps(payload))
    r.lpush(f"job:{job_id}:events:log", json.dumps(payload))
    r.ltrim(f"job:{job_id}:events:log", 0, 99)
