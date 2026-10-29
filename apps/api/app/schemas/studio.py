from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class StemMixState(BaseModel):
    volume: float = Field(default=1.0, ge=0, le=2)
    mute: bool = False
    solo: bool = False
    pan: float = Field(default=0.0, ge=-1, le=1)


class EqBandState(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(max_length=32)
    label: str = Field(default="", max_length=64)
    type: str = Field(default="peaking", max_length=16)
    frequency: float = Field(default=1000, ge=20, le=20000)
    gain_db: float = Field(default=0, alias="gainDb", ge=-12, le=12)
    q: float = Field(default=1.0, ge=0.1, le=10)


class EqState(BaseModel):
    enabled: bool = True
    bands: list[EqBandState] = Field(default_factory=list)


class FxCompressorState(BaseModel):
    enabled: bool = False
    threshold: float = Field(default=-24, ge=-60, le=0)
    ratio: float = Field(default=3, ge=1, le=20)
    attack: float = Field(default=0.01, ge=0.001, le=1)
    release: float = Field(default=0.25, ge=0.01, le=2)


class FxDelayState(BaseModel):
    enabled: bool = False
    timeSec: float = Field(default=0.28, ge=0.01, le=1)
    feedback: float = Field(default=0.25, ge=0, le=0.85)
    mix: float = Field(default=0.2, ge=0, le=1)


class FxReverbState(BaseModel):
    enabled: bool = False
    mix: float = Field(default=0.18, ge=0, le=1)
    decay: float = Field(default=0.55, ge=0.2, le=0.95)


class FxState(BaseModel):
    enabled: bool = True
    compressor: FxCompressorState = Field(default_factory=FxCompressorState)
    delay: FxDelayState = Field(default_factory=FxDelayState)
    reverb: FxReverbState = Field(default_factory=FxReverbState)


class MixState(BaseModel):
    stems: dict[str, StemMixState] = Field(default_factory=dict)
    master_gain: float = Field(default=1.0, ge=0, le=2)
    eq: Optional[EqState] = None
    fx: Optional[FxState] = None


class MixPresetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    owner_id: str
    name: str
    is_default: bool
    state: dict[str, Any]
    version: int
    created_at: datetime
    updated_at: datetime


class MixPutRequest(BaseModel):
    name: str = Field(default="Padrão", max_length=120)
    state: MixState
    is_default: bool = True


class MarkerCreate(BaseModel):
    position_ms: int = Field(ge=0)
    label: str = Field(min_length=1, max_length=120)
    color: Optional[str] = Field(default=None, max_length=32)


class MarkerUpdate(BaseModel):
    position_ms: Optional[int] = Field(default=None, ge=0)
    label: Optional[str] = Field(default=None, min_length=1, max_length=120)
    color: Optional[str] = Field(default=None, max_length=32)


class MarkerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    owner_id: str
    position_ms: int
    label: str
    color: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LoopRegionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)


class LoopRegionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    start_ms: Optional[int] = Field(default=None, ge=0)
    end_ms: Optional[int] = Field(default=None, gt=0)


class LoopRegionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    owner_id: str
    name: str
    start_ms: int
    end_ms: int
    created_at: datetime
    updated_at: datetime


class ExportCreateRequest(BaseModel):
    kind: str = Field(description="stem | stems_zip | mixdown")
    params: dict[str, Any] = Field(default_factory=dict)


class ExportJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    owner_id: str
    kind: str
    status: str
    params: dict[str, Any]
    result_asset_id: Optional[str] = None
    idempotency_key: str
    error_message: Optional[str] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
