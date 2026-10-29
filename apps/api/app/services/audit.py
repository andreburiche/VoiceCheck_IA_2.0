"""Escrita de audit_logs (ações sensíveis)."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import AuditLog


def write_audit(
    db: Session,
    *,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    actor_id: str | None = None,
    request: Request | None = None,
    meta: dict[str, Any] | None = None,
    commit: bool = False,
) -> AuditLog:
    ip = None
    ua = None
    if request is not None:
        ip = request.client.host if request.client else None
        ua = (request.headers.get("user-agent") or "")[:512] or None

    row = AuditLog(
        id=str(uuid4()),
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip=ip,
        user_agent=ua,
        meta=meta or {},
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    return row
