from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class SeparationCreateRequest(BaseModel):
    source_asset_id: str
    model_code: str = "htdemucs"
    params: dict[str, Any] = Field(default_factory=dict)


class ProcessingJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    project_id: str
    source_asset_id: str
    model_id: str
    status: str
    progress: Decimal
    idempotency_key: str
    params: dict[str, Any]
    model_version: str
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    attempt: int
    created_at: datetime
    updated_at: datetime
    model_code: Optional[str] = None


class ProcessingJobListResponse(BaseModel):
    items: list[ProcessingJobResponse]
    total: int


class StemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    project_id: str
    owner_id: str
    stem_type: str
    asset_id: str
    proxy_asset_id: Optional[str] = None
    order_index: int
    created_at: datetime


class StemListResponse(BaseModel):
    items: list[StemResponse]
    total: int


class MessageResponse(BaseModel):
    message: str
