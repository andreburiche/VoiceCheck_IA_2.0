from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class VoiceCheckProbeOut(BaseModel):
    duration_ms: int | None = None
    sample_rate: int | None = None
    channels: int | None = None
    has_audio: bool = False
    has_video: bool = False
    format_name: str | None = None
    audio_codec: str | None = None
    video_codec: str | None = None
    ffprobe_ok: bool = False


class VoiceCheckPrepareResponse(BaseModel):
    job_id: str
    original_filename: str
    original_unchanged: bool = True
    probe: VoiceCheckProbeOut
    wav: dict = Field(
        default_factory=dict,
        description="Metadados do WAV interno (duration_ms, sample_rate, channels, size_bytes)",
    )
    audio_path: str = Field(description="URL relativa para baixar o WAV preparado")
    message: str


class VoiceCheckAnalyzeParams(BaseModel):
    fmin_hz: float = Field(default=65.0, ge=40.0, le=300.0)
    fmax_hz: float = Field(default=1100.0, ge=200.0, le=2000.0)
    frame_length: int = Field(default=2048, ge=512, le=8192)
    hop_length: int = Field(default=512, ge=64, le=4096)
    periodicity_threshold: float = Field(default=0.15, ge=0.05, le=0.4)


# ---------------------------------------------------------------------------
# Registro de diagnósticos (salvos para reabrir/editar)
# ---------------------------------------------------------------------------

VoiceCheckStepName = Literal["importar", "preparar", "analisar", "resultados", "melhorar"]


class VoiceCheckAssetMetaIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(default="application/octet-stream", max_length=128)
    size_bytes: int = Field(default=0, ge=0)
    duration_sec: float | None = Field(default=None, ge=0)
    kind: Literal["audio", "video", "unknown"] = "unknown"
    ext: str = Field(default="", max_length=10)


class VoiceCheckSummaryIn(BaseModel):
    events: int = Field(default=0, ge=0)
    positives: int = Field(default=0, ge=0)
    valid_frame_percent: float | None = None


class VoiceCheckDiagnosisUpsert(BaseModel):
    """Campos omitidos não são alterados; `report: null` apaga o relatório."""

    title: str = Field(min_length=1, max_length=120)
    step: VoiceCheckStepName = "importar"
    max_reached: int = Field(default=0, ge=0, le=4)
    asset: VoiceCheckAssetMetaIn | None = None
    probe: dict[str, Any] | None = None
    summary: VoiceCheckSummaryIn | None = None
    analysis_source: Literal["python", "browser_fallback"] | None = None
    report: dict[str, Any] | None = None
    #: Ajustes e resultado do autotune; null apaga.
    autotune: dict[str, Any] | None = None
    #: Equalização e efeitos da voz; null apaga.
    voice_mix: dict[str, Any] | None = None
    created_at: datetime | None = None


class VoiceCheckDiagnosisListItem(BaseModel):
    id: str
    title: str
    step: str
    max_reached: int
    asset: dict[str, Any] | None = None
    summary: dict[str, Any] | None = None
    analysis_source: str | None = None
    has_original: bool
    has_prepared: bool
    has_report: bool
    has_corrected: bool = False
    autotune: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class VoiceCheckDiagnosisListResponse(BaseModel):
    items: list[VoiceCheckDiagnosisListItem]


class VoiceCheckDiagnosisOut(VoiceCheckDiagnosisListItem):
    probe: dict[str, Any] | None = None
    voice_mix: dict[str, Any] | None = None
    report: dict[str, Any] | None = None
