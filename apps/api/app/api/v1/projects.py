from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.models import Project
from app.schemas.projects import ProjectCreate, ProjectListResponse, ProjectResponse, ProjectUpdate
from app.services.ownership import get_owned_project

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectListResponse)
def list_projects(
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ProjectListResponse:
    base = select(Project).where(Project.owner_id == user.id, Project.deleted_at.is_(None))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(base.order_by(Project.created_at.desc()).limit(limit).offset(offset)).all()
    return ProjectListResponse(items=[ProjectResponse.model_validate(p) for p in items], total=total)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
def create_project(payload: ProjectCreate, user: CurrentUser, db: DbSession) -> ProjectResponse:
    project = Project(
        owner_id=user.id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, user: CurrentUser, db: DbSession) -> ProjectResponse:
    project = get_owned_project(db, project_id, user)
    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse, dependencies=[Depends(verify_csrf)])
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    user: CurrentUser,
    db: DbSession,
) -> ProjectResponse:
    project = get_owned_project(db, project_id, user)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "description" in data and isinstance(data["description"], str):
        data["description"] = data["description"].strip() or None
    for key, value in data.items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(verify_csrf)])
def delete_project(project_id: str, user: CurrentUser, db: DbSession) -> None:
    project = get_owned_project(db, project_id, user)
    project.deleted_at = datetime.now(UTC)
    db.commit()


@router.post("/{project_id}/restore", response_model=ProjectResponse, dependencies=[Depends(verify_csrf)])
def restore_project(project_id: str, user: CurrentUser, db: DbSession) -> ProjectResponse:
    """Desfaz a exclusão (o projeto só foi marcado como removido)."""
    project = db.scalar(select(Project).where(Project.id == project_id, Project.owner_id == user.id))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Música não encontrada.")
    project.deleted_at = None
    db.commit()
    db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.get("/{project_id}/assets")
def list_project_assets(
    project_id: str,
    user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    from app.models import AudioAsset
    from app.schemas.uploads import AudioAssetListResponse, AudioAssetResponse

    get_owned_project(db, project_id, user)
    base = select(AudioAsset).where(
        AudioAsset.project_id == project_id,
        AudioAsset.owner_id == user.id,
        AudioAsset.deleted_at.is_(None),
    )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = db.scalars(base.order_by(AudioAsset.created_at.desc()).limit(limit).offset(offset)).all()
    return AudioAssetListResponse(
        items=[AudioAssetResponse.model_validate(a) for a in items],
        total=total,
    )
