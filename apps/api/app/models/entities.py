from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    CHAR,
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"


class SubscriptionStatus(str, enum.Enum):
    active = "active"
    past_due = "past_due"
    cancelled = "cancelled"


class AssetKind(str, enum.Enum):
    original = "original"
    stem = "stem"
    proxy = "proxy"
    export = "export"


class AssetStatus(str, enum.Enum):
    pending = "pending"
    ready = "ready"
    failed = "failed"


class JobStatus(str, enum.Enum):
    queued = "queued"
    preparing = "preparing"
    processing = "processing"
    postprocessing = "postprocessing"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class StemType(str, enum.Enum):
    vocals = "vocals"
    drums = "drums"
    bass = "bass"
    other = "other"
    instrumental = "instrumental"  # vocals + soma drums/bass/other (modelo 2-stem)


class VocalTranscriptionStatus(str, enum.Enum):
    draft = "draft"
    ready = "ready"
    needs_review = "needs_review"
    failed = "failed"


class VocalVoiceRole(str, enum.Enum):
    unassigned = "unassigned"
    principal = "principal"
    segunda = "segunda"
    terceira = "terceira"
    quarta = "quarta"
    soprano = "soprano"
    contralto = "contralto"
    tenor = "tenor"
    baixo = "baixo"


class PracticeProfile(str, enum.Enum):
    singer = "singer"
    drums = "drums"
    bass = "bass"
    guitar = "guitar"
    keys = "keys"
    general = "general"


class ExportKind(str, enum.Enum):
    stem = "stem"
    stems_zip = "stems_zip"
    mixdown = "mixdown"


class ExportStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class UsageKind(str, enum.Enum):
    separation_minutes = "separation_minutes"
    export = "export"
    storage = "storage"


class UsageUnit(str, enum.Enum):
    minutes = "minutes"
    bytes = "bytes"
    count = "count"


#: Nome/código do paciente: comparação exata no MySQL ("Lúcia" ≠ "Lucia", "P01" ≠ "p01").
NOME_PACIENTE = String(120).with_variant(mysql.VARCHAR(120, charset="utf8mb4", collation="utf8mb4_bin"), "mysql")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.user, nullable=False)
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    #: Sessões emitidas antes disto deixam de valer (ex.: após redefinir a senha).
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    projects: Mapped[list[Project]] = relationship(back_populates="owner")
    subscriptions: Mapped[list[Subscription]] = relationship(back_populates="user")


class Plan(Base, TimestampMixin):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    max_minutes_month: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    max_storage_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=512)
    max_concurrent_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    features: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    subscriptions: Mapped[list[Subscription]] = relationship(back_populates="plan")


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"
    __table_args__ = (Index("ix_subscriptions_user_status", "user_id", "status"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    plan_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("plans.id"), nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus), default=SubscriptionStatus.active, nullable=False
    )
    current_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship(back_populates="subscriptions")
    plan: Mapped[Plan] = relationship(back_populates="subscriptions")


class Project(Base, TimestampMixin):
    __tablename__ = "projects"
    __table_args__ = (Index("ix_projects_owner_created", "owner_id", "created_at"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bpm: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    musical_key: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    chords_hint: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    owner: Mapped[User] = relationship(back_populates="projects")


class AudioAsset(Base, TimestampMixin):
    __tablename__ = "audio_assets"
    __table_args__ = (Index("ix_audio_assets_owner_project", "owner_id", "project_id"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    project_id: Mapped[Optional[str]] = mapped_column(CHAR(36), ForeignKey("projects.id"), nullable=True)
    kind: Mapped[AssetKind] = mapped_column(Enum(AssetKind), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    format: Mapped[str] = mapped_column(String(32), nullable=False)
    checksum_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sample_rate: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    channels: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    original_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[AssetStatus] = mapped_column(Enum(AssetStatus), default=AssetStatus.pending, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ProcessingModel(Base, TimestampMixin):
    __tablename__ = "processing_models"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    stem_layout: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    license: Mapped[str] = mapped_column(String(64), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    min_vram_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    params_schema: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


class ProcessingJob(Base, TimestampMixin):
    __tablename__ = "processing_jobs"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_processing_jobs_idempotency"),
        Index("ix_processing_jobs_owner_status", "owner_id", "status"),
    )

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("projects.id"), nullable=False)
    source_asset_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("audio_assets.id"), nullable=False)
    model_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("processing_models.id"), nullable=False)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.queued, nullable=False)
    progress: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("0"))
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    billed_usage_id: Mapped[Optional[str]] = mapped_column(CHAR(36), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Stem(Base, TimestampMixin):
    __tablename__ = "stems"
    __table_args__ = (Index("ix_stems_project_job", "project_id", "job_id"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("processing_jobs.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("projects.id"), nullable=False)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    stem_type: Mapped[StemType] = mapped_column(Enum(StemType), nullable=False)
    asset_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("audio_assets.id"), nullable=False)
    proxy_asset_id: Mapped[Optional[str]] = mapped_column(CHAR(36), ForeignKey("audio_assets.id"), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class MixPreset(Base, TimestampMixin):
    __tablename__ = "mix_presets"
    __table_args__ = (Index("ix_mix_presets_project", "project_id", "owner_id"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("projects.id"), nullable=False)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class Marker(Base, TimestampMixin):
    __tablename__ = "markers"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("projects.id"), nullable=False, index=True)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    position_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)


class LoopRegion(Base, TimestampMixin):
    __tablename__ = "loop_regions"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("projects.id"), nullable=False, index=True)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)


class PracticeSession(Base, TimestampMixin):
    __tablename__ = "practice_sessions"
    __table_args__ = (Index("ix_practice_sessions_owner", "owner_id", "created_at"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("projects.id"), nullable=False)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    profile: Mapped[PracticeProfile] = mapped_column(Enum(PracticeProfile), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    metronome_bpm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    speed_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=100)


class ExportJob(Base, TimestampMixin):
    __tablename__ = "export_jobs"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_export_jobs_idempotency"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("projects.id"), nullable=False)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    kind: Mapped[ExportKind] = mapped_column(Enum(ExportKind), nullable=False)
    status: Mapped[ExportStatus] = mapped_column(Enum(ExportStatus), default=ExportStatus.queued, nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    result_asset_id: Mapped[Optional[str]] = mapped_column(CHAR(36), ForeignKey("audio_assets.id"), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class UsageLedger(Base):
    __tablename__ = "usage_ledger"
    __table_args__ = (
        UniqueConstraint("job_id", name="uq_usage_ledger_job"),
        Index("ix_usage_ledger_user_period", "user_id", "period_ym"),
    )

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    job_id: Mapped[Optional[str]] = mapped_column(CHAR(36), ForeignKey("processing_jobs.id"), nullable=True)
    kind: Mapped[UsageKind] = mapped_column(Enum(UsageKind), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit: Mapped[UsageUnit] = mapped_column(Enum(UsageUnit), nullable=False)
    period_ym: Mapped[str] = mapped_column(CHAR(7), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_actor_created", "actor_id", "created_at"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    actor_id: Mapped[Optional[str]] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[Optional[str]] = mapped_column(CHAR(36), nullable=True)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class VocalTranscription(Base, TimestampMixin):
    __tablename__ = "vocal_transcriptions"
    __table_args__ = (Index("ix_vocal_transcriptions_project", "project_id", "owner_id"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("projects.id"), nullable=False)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    source_asset_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("audio_assets.id"), nullable=False)
    status: Mapped[VocalTranscriptionStatus] = mapped_column(
        Enum(VocalTranscriptionStatus),
        default=VocalTranscriptionStatus.draft,
        nullable=False,
    )
    engine: Mapped[str] = mapped_column(String(64), nullable=False, default="client_yin_v1")
    bpm: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    musical_key: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    confidence: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4), nullable=True)
    polyphony_warning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    parts: Mapped[list[VocalPart]] = relationship(back_populates="transcription", cascade="all, delete-orphan")
    versions: Mapped[list[ScoreVersion]] = relationship(
        back_populates="transcription",
        cascade="all, delete-orphan",
    )


class VocalPart(Base, TimestampMixin):
    __tablename__ = "vocal_parts"
    __table_args__ = (Index("ix_vocal_parts_transcription", "transcription_id"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    transcription_id: Mapped[str] = mapped_column(
        CHAR(36),
        ForeignKey("vocal_transcriptions.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    voice_role: Mapped[VocalVoiceRole] = mapped_column(
        Enum(VocalVoiceRole),
        default=VocalVoiceRole.principal,
        nullable=False,
    )
    needs_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    audio_asset_id: Mapped[Optional[str]] = mapped_column(CHAR(36), ForeignKey("audio_assets.id"), nullable=True)

    transcription: Mapped[VocalTranscription] = relationship(back_populates="parts")
    notes: Mapped[list[TranscriptionNote]] = relationship(
        back_populates="part",
        cascade="all, delete-orphan",
    )


class TranscriptionNote(Base, TimestampMixin):
    __tablename__ = "transcription_notes"
    __table_args__ = (Index("ix_transcription_notes_part_start", "part_id", "start_ms"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    part_id: Mapped[str] = mapped_column(
        CHAR(36),
        ForeignKey("vocal_parts.id", ondelete="CASCADE"),
        nullable=False,
    )
    pitch_midi: Mapped[int] = mapped_column(Integer, nullable=False)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    velocity: Mapped[int] = mapped_column(Integer, nullable=False, default=80)
    is_rest: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tie_group: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    lyric_syllable: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    part: Mapped[VocalPart] = relationship(back_populates="notes")


class ScoreVersion(Base, TimestampMixin):
    __tablename__ = "score_versions"
    __table_args__ = (UniqueConstraint("transcription_id", "version", name="uq_score_versions_tx_ver"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    transcription_id: Mapped[str] = mapped_column(
        CHAR(36),
        ForeignKey("vocal_transcriptions.id", ondelete="CASCADE"),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    musicxml: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    transcription: Mapped[VocalTranscription] = relationship(back_populates="versions")



class VoiceCheckDiagnosis(Base, TimestampMixin):
    """Diagnóstico VoiceCheck salvo pelo usuário (registro para reabrir e editar).

    O id vem do cliente (UUID gerado no navegador) para casar com a cópia local.
    Áudios ficam no storage; o relatório da análise fica em JSON.
    """

    __tablename__ = "voicecheck_diagnoses"
    __table_args__ = (Index("ix_voicecheck_diagnoses_owner_updated", "owner_id", "updated_at"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    step: Mapped[str] = mapped_column(String(16), nullable=False, default="importar")
    max_reached: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    asset_meta: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    probe: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    summary: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    analysis_source: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    report: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    original_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    original_mime: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    original_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    original_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prepared_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    prepared_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Versão afinada (autotune) e os ajustes usados para gerá-la.
    corrected_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    corrected_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    autotune: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    #: Ajustes de equalização e efeitos (reverb, delay…) escolhidos para a voz.
    voice_mix: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)


class PasswordResetToken(Base):
    """Link de "esqueci minha senha": só o hash do token é guardado."""

    __tablename__ = "password_reset_tokens"
    __table_args__ = (Index("ix_password_reset_user", "user_id", "created_at"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    requested_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ClinicalEvaluation(Base, TimestampMixin):
    """Avaliação clínica da voz (VoiceCheck IA 2.0): análise acústica ou protocolo.

    Cada registro guarda o resultado calculado no servidor (nunca o que o
    navegador diz), para acompanhar a evolução do paciente entre sessões.
    """

    __tablename__ = "clinical_evaluations"
    __table_args__ = (
        Index("ix_clinical_evaluations_owner_patient", "owner_id", "patient_name", "created_at"),
        UniqueConstraint("owner_id", "client_ref", name="uq_clinical_evaluations_owner_client_ref"),
        Index("ix_clinical_evaluations_plan_created", "practice_plan_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    #: Como o profissional identifica o paciente (nome ou código).
    patient_name: Mapped[str] = mapped_column(NOME_PACIENTE, nullable=False)
    #: acustica | idv10 | qvv | grbasi | easebr | anamnese | biofeedback | jogo | fonetograma | pratica
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    #: Motor da análise acústica (praat | interno); vazio nos protocolos.
    engine: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    #: Com microssegundos: o DATETIME do MySQL guarda só segundos, e duas avaliações salvas no
    #: mesmo segundo (análise + protocolo) ficavam em ordem aleatória no histórico e no relatório.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True).with_variant(mysql.DATETIME(fsp=6), "mysql"),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    #: Id gerado no celular (prática em casa): reenviar a mesma sessão não duplica.
    client_ref: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    #: Plano de prática em casa de onde veio a sessão (conta sessões por plano e por dia).
    practice_plan_id: Mapped[Optional[str]] = mapped_column(
        CHAR(36),
        ForeignKey("home_practice_plans.id", ondelete="SET NULL", name="fk_clinical_evaluations_practice_plan"),
        nullable=True,
    )
    #: Gravação da análise acústica no storage (ouvir de novo e comparar antes/depois).
    audio_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    #: Tamanho do WAV guardado; entra na cota de armazenamento do plano.
    audio_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    #: Anotação livre do profissional sobre esta avaliação/gravação (texto, até 4000 caracteres).
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class VoicePatient(Base, TimestampMixin):
    """Cadastro do paciente da avaliação clínica (VoiceCheck IA 2.0).

    Ligado às avaliações pelo nome/código usado pelo profissional (único por profissional).
    Todos os campos além do nome são opcionais: guarde só o necessário (LGPD, minimização).
    """

    __tablename__ = "voice_patients"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_voice_patients_owner_name"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(NOME_PACIENTE, nullable=False)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    #: feminino | masculino | outro
    sex: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    occupation: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    #: Usa a voz profissionalmente (professor, cantor, operador de telemarketing...).
    voice_professional: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class HomePracticePlan(Base, TimestampMixin):
    """Plano de prática em casa: exercícios que o paciente faz pelo celular.

    O paciente entra por um link secreto (sem conta). Só o hash do token fica
    salvo; o link pode expirar ou ser revogado pelo profissional.
    """

    __tablename__ = "home_practice_plans"
    __table_args__ = (Index("ix_home_practice_plans_owner_patient", "owner_id", "patient_name", "created_at"),)

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(CHAR(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    patient_name: Mapped[str] = mapped_column(NOME_PACIENTE, nullable=False)
    #: Como a página do celular chama o paciente (opcional; o nome completo não vai ao celular).
    greeting: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    exercises: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class StoragePendingDelete(Base, TimestampMixin):
    """Arquivo que o storage não conseguiu apagar (rede, S3 fora do ar...): nova tentativa depois.

    Guarda só a chave do arquivo (ids, sem nome de paciente). Sai da tabela quando o arquivo é apagado.
    """

    __tablename__ = "storage_pending_deletes"

    id: Mapped[str] = mapped_column(CHAR(36), primary_key=True, default=_uuid)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_error: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
