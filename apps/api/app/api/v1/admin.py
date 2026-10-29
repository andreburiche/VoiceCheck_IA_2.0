from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbSession
from app.models import AuditLog, ProcessingJob, User
from app.models.entities import JobStatus
from app.schemas.admin import (
    AdminAuditItem,
    AdminAuditListResponse,
    AdminJobItem,
    AdminJobListResponse,
    AdminUserItem,
    AdminUserListResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    _admin: AdminUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AdminUserListResponse:
    base = select(User).where(User.deleted_at.is_(None))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(User.created_at.desc()).limit(limit).offset(offset)).all()
    return AdminUserListResponse(
        items=[
            AdminUserItem(
                id=u.id,
                email=u.email,
                name=u.name,
                role=u.role.value,
                created_at=u.created_at,
                deleted_at=u.deleted_at,
            )
            for u in rows
        ],
        total=total,
    )


@router.get("/jobs", response_model=AdminJobListResponse)
def list_jobs(
    _admin: AdminUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
) -> AdminJobListResponse:
    base = select(ProcessingJob)
    if status:
        try:
            base = base.where(ProcessingJob.status == JobStatus(status))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Status inválido") from exc
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(ProcessingJob.created_at.desc()).limit(limit).offset(offset)).all()
    return AdminJobListResponse(
        items=[
            AdminJobItem(
                id=j.id,
                owner_id=j.owner_id,
                project_id=j.project_id,
                status=j.status.value,
                progress=float(j.progress),
                model_version=j.model_version,
                error_code=j.error_code,
                created_at=j.created_at,
                finished_at=j.finished_at,
            )
            for j in rows
        ],
        total=total,
    )


@router.get("/audit-logs", response_model=AdminAuditListResponse)
def list_audit(
    _admin: AdminUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AdminAuditListResponse:
    base = select(AuditLog)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)).all()
    return AdminAuditListResponse(
        items=[AdminAuditItem.model_validate(r) for r in rows],
        total=total,
    )
