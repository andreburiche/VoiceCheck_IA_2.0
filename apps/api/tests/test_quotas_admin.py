from __future__ import annotations

import os
import uuid
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Plan, UsageLedger, User
from app.models.entities import UsageKind, UsageUnit, UserRole
from app.services.quotas import QuotaExceeded, assert_can_start_separation, current_period_ym, get_usage_snapshot

BASE = os.getenv("PUBLIC_API_URL", "http://localhost:8000")


@pytest.fixture
def client() -> httpx.Client:
    c = httpx.Client(base_url=BASE, timeout=30.0)
    try:
        if c.get("/health").status_code != 200:
            pytest.skip("API down")
    except httpx.ConnectError:
        pytest.skip("API down")
    email = f"quota_{uuid.uuid4().hex[:8]}@example.com"
    reg = c.post("/api/v1/auth/register", json={"email": email, "password": "senha12345", "name": "Quota"})
    assert reg.status_code == 201
    c.cookies.update(reg.cookies)
    c.headers["X-CSRF-Token"] = reg.json()["csrf_token"]
    c._test_email = email  # type: ignore[attr-defined]
    c._test_user_id = reg.json()["user"]["id"]  # type: ignore[attr-defined]
    return c


def test_usage_endpoint(client: httpx.Client) -> None:
    r = client.get("/api/v1/users/me/usage")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["plan_code"] == "free"
    assert body["max_minutes_month"] >= 1
    assert "period_ym" in body


def test_admin_forbidden_for_user(client: httpx.Client) -> None:
    r = client.get("/api/v1/admin/users")
    assert r.status_code == 403


def test_admin_lists_after_promote(client: httpx.Client) -> None:
    email = client._test_email  # type: ignore[attr-defined]
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        user.role = UserRole.admin
        db.commit()
    finally:
        db.close()

    users = client.get("/api/v1/admin/users")
    assert users.status_code == 200, users.text
    assert users.json()["total"] >= 1

    jobs = client.get("/api/v1/admin/jobs")
    assert jobs.status_code == 200

    audits = client.get("/api/v1/admin/audit-logs")
    assert audits.status_code == 200
    assert audits.json()["total"] >= 1  # register gera audit


def test_quota_minutes_blocks(client: httpx.Client) -> None:
    uid = client._test_user_id  # type: ignore[attr-defined]
    db = SessionLocal()
    try:
        plan = db.scalar(select(Plan).where(Plan.code == "free"))
        assert plan is not None
        # Esgota cota do período
        db.add(
            UsageLedger(
                user_id=uid,
                job_id=None,
                kind=UsageKind.separation_minutes,
                quantity=Decimal(plan.max_minutes_month),
                unit=UsageUnit.minutes,
                period_ym=current_period_ym(),
            )
        )
        db.commit()
        with pytest.raises(QuotaExceeded) as exc:
            assert_can_start_separation(db, uid, duration_ms=60_000)
        assert exc.value.code == "QUOTA_MINUTES"

        snap = get_usage_snapshot(db, uid)
        assert snap.minutes_used >= plan.max_minutes_month
    finally:
        db.close()


def test_metrics_endpoint() -> None:
    try:
        r = httpx.get(f"{BASE}/metrics", timeout=10.0)
    except httpx.ConnectError:
        pytest.skip("API down")
    assert r.status_code == 200
    assert "estudio_" in r.text or "# HELP" in r.text
