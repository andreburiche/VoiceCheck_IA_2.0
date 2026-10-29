from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.models import PracticeSession
from app.models.entities import PracticeProfile
from app.schemas.practice import (
    PracticeSessionCreate,
    PracticeSessionListResponse,
    PracticeSessionResponse,
)
from app.services.ownership import get_owned_project

router = APIRouter(tags=["practice"])


@router.get("/projects/{project_id}/practice-sessions", response_model=PracticeSessionListResponse)
def list_sessions(
    project_id: str,
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PracticeSessionListResponse:
    get_owned_project(db, project_id, user)
    base = select(PracticeSession).where(
        PracticeSession.project_id == project_id,
        PracticeSession.owner_id == user.id,
    )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(base.order_by(PracticeSession.created_at.desc()).limit(limit).offset(offset)).all()
    return PracticeSessionListResponse(
        items=[PracticeSessionResponse.model_validate(s) for s in items],
        total=total,
    )


@router.post(
    "/projects/{project_id}/practice-sessions",
    response_model=PracticeSessionResponse,
    status_code=201,
    dependencies=[Depends(verify_csrf)],
)
def create_session(
    project_id: str,
    payload: PracticeSessionCreate,
    user: CurrentUser,
    db: DbSession,
) -> PracticeSessionResponse:
    get_owned_project(db, project_id, user)
    try:
        profile = PracticeProfile(payload.profile)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Perfil inválido") from exc

    session = PracticeSession(
        id=str(uuid4()),
        project_id=project_id,
        owner_id=user.id,
        profile=profile,
        notes=payload.notes.strip() if payload.notes else None,
        duration_sec=payload.duration_sec,
        metronome_bpm=payload.metronome_bpm,
        speed_pct=payload.speed_pct,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return PracticeSessionResponse.model_validate(session)
