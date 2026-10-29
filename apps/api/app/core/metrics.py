"""Métricas Prometheus (contadores básicos)."""

from __future__ import annotations

from prometheus_client import Counter, generate_latest, CONTENT_TYPE_LATEST

JOBS_CREATED = Counter(
    "estudio_separation_jobs_created_total",
    "Jobs de separação criados",
)
JOBS_CANCELLED = Counter(
    "estudio_separation_jobs_cancelled_total",
    "Jobs de separação cancelados pelo usuário",
)
JOBS_QUOTA_REJECTED = Counter(
    "estudio_separation_jobs_quota_rejected_total",
    "Tentativas de separação rejeitadas por cota",
)
AUTH_REGISTERED = Counter(
    "estudio_auth_registrations_total",
    "Novos cadastros",
)
AUTH_LOGIN_FAILED = Counter(
    "estudio_auth_login_failures_total",
    "Falhas de login",
)


def metrics_payload() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
