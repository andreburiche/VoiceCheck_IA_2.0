from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

PracticeProfileName = Literal["singer", "drums", "bass", "guitar", "keys", "general"]


class PracticeSessionCreate(BaseModel):
    profile: PracticeProfileName
    notes: Optional[str] = Field(default=None, max_length=5000)
    duration_sec: int = Field(default=0, ge=0, le=86400)
    metronome_bpm: Optional[int] = Field(default=None, ge=30, le=300)
    speed_pct: int = Field(default=100, ge=25, le=200)


class PracticeSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    owner_id: str
    profile: str
    notes: Optional[str] = None
    duration_sec: int
    metronome_bpm: Optional[int] = None
    speed_pct: int
    created_at: datetime
    updated_at: datetime


class PracticeSessionListResponse(BaseModel):
    items: list[PracticeSessionResponse]
    total: int
