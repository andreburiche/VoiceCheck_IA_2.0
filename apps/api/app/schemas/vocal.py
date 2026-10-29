from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field


class NoteIn(BaseModel):
    pitch_midi: int = Field(ge=0, le=127)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    velocity: int = Field(default=80, ge=1, le=127)
    is_rest: bool = False
    tie_group: Optional[str] = None
    lyric_syllable: Optional[str] = None


class PartIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    voice_role: str = "principal"
    needs_review: bool = False
    order_index: int = 0
    notes: list[NoteIn] = Field(default_factory=list)


class TranscriptionCreateRequest(BaseModel):
    source_asset_id: str
    engine: str = "client_yin_v1"
    bpm: Optional[float] = None
    musical_key: Optional[str] = None
    confidence: Optional[float] = None
    polyphony_warning: bool = True
    status: str = "needs_review"
    meta: dict[str, Any] = Field(default_factory=dict)
    parts: list[PartIn] = Field(default_factory=list)
    musicxml: Optional[str] = None


class WorkerTranscriptionRequest(BaseModel):
    """Enfileira Basic Pitch / YIN no worker Celery."""

    source_asset_id: Optional[str] = None
    label: str = Field(default="Voz principal", min_length=1, max_length=120)
    voice_role: str = "principal"


class NoteOut(BaseModel):
    id: str
    pitch_midi: int
    start_ms: int
    end_ms: int
    velocity: int
    is_rest: bool
    tie_group: Optional[str] = None
    lyric_syllable: Optional[str] = None

    model_config = {"from_attributes": True}


class PartOut(BaseModel):
    id: str
    label: str
    voice_role: str
    needs_review: bool
    order_index: int
    notes: list[NoteOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PartRoleUpdate(BaseModel):
    voice_role: str
    label: Optional[str] = None
    needs_review: Optional[bool] = None


class PartCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    voice_role: str = "unassigned"
    needs_review: bool = True
    order_index: Optional[int] = None
    audio_asset_id: Optional[str] = None
    notes: list[NoteIn] = Field(default_factory=list)
    annotation: Optional[str] = Field(default=None, max_length=2000)


class NotesReplaceRequest(BaseModel):
    notes: list[NoteIn]
    musicxml: Optional[str] = None
    label: Optional[str] = "Edição manual"


class PartAnnotationUpdate(BaseModel):
    annotation: str = Field(default="", max_length=2000)


class TranscriptionOut(BaseModel):
    id: str
    project_id: str
    source_asset_id: str
    status: str
    engine: str
    bpm: Optional[Decimal] = None
    musical_key: Optional[str] = None
    confidence: Optional[Decimal] = None
    polyphony_warning: bool
    meta: dict[str, Any] = Field(default_factory=dict)
    parts: list[PartOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TranscriptionListOut(BaseModel):
    items: list[TranscriptionOut]
    total: int
