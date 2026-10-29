from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import AudioAsset, Project, User


def get_owned_project(db: Session, project_id: str, user: User) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto não encontrado")
    if project.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado ao projeto")
    return project


def get_owned_asset(db: Session, asset_id: str, user: User) -> AudioAsset:
    asset = db.get(AudioAsset, asset_id)
    if not asset or asset.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset não encontrado")
    if asset.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado ao asset")
    return asset
