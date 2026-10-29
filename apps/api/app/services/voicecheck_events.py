"""Evento acústico estruturado (VoiceCheck técnico)."""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class AcousticEvent:
    category: str
    start_seconds: float
    end_seconds: float
    title: str
    description: str
    evidence: dict[str, Any]
    confidence: float | None
    recommendation_key: str | None = None
    severity: str = "info"  # info | notice | caution
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["start_seconds"] = round(self.start_seconds, 3)
        d["end_seconds"] = round(self.end_seconds, 3)
        if self.confidence is not None:
            d["confidence"] = round(float(self.confidence), 3)
        return d


@dataclass
class PositiveFinding:
    key: str
    title: str
    description: str
    evidence: dict[str, Any]
    start_seconds: float | None = None
    end_seconds: float | None = None
    confidence: float | None = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if self.start_seconds is not None:
            d["start_seconds"] = round(self.start_seconds, 3)
        if self.end_seconds is not None:
            d["end_seconds"] = round(self.end_seconds, 3)
        if self.confidence is not None:
            d["confidence"] = round(float(self.confidence), 3)
        return d
