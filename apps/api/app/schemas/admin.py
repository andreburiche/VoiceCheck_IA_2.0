from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.auth import AppEmail


class AdminUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: AppEmail
    name: str
    role: str
    created_at: datetime
    deleted_at: datetime | None = None


class AdminUserListResponse(BaseModel):
    items: list[AdminUserItem]
    total: int


class AdminJobItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    project_id: str
    status: str
    progress: float | str
    model_version: str
    error_code: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class AdminJobListResponse(BaseModel):
    items: list[AdminJobItem]
    total: int


class AdminAuditItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    actor_id: str | None
    action: str
    resource_type: str
    resource_id: str | None
    created_at: datetime
    meta: dict = Field(default_factory=dict)


class AdminAuditListResponse(BaseModel):
    items: list[AdminAuditItem]
    total: int
