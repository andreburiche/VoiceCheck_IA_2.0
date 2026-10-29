from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UploadInitiateRequest(BaseModel):
    project_id: str
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=3, max_length=128)
    size_bytes: int = Field(gt=0)
    checksum_sha256: str = Field(min_length=64, max_length=64, pattern=r"^[a-fA-F0-9]{64}$")
    rights_confirmed: bool = Field(
        description="Usuário confirma ter direito de uso da obra",
    )


class UploadInitiateResponse(BaseModel):
    asset_id: str
    upload_url: str
    storage_key: str
    expires_in: int
    method: str = "PUT"


class UploadCompleteRequest(BaseModel):
    asset_id: str
    checksum_sha256: str = Field(min_length=64, max_length=64, pattern=r"^[a-fA-F0-9]{64}$")


class AudioAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    project_id: Optional[str] = None
    kind: str
    mime_type: str
    format: str
    checksum_sha256: Optional[str] = None
    size_bytes: int
    duration_ms: Optional[int] = None
    sample_rate: Optional[int] = None
    channels: Optional[int] = None
    original_filename: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime


class AudioAssetListResponse(BaseModel):
    items: list[AudioAssetResponse]
    total: int


class PlaybackUrlResponse(BaseModel):
    url: str
    expires_in: int
