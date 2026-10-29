"""initial schema

Revision ID: 20261023_0001
Revises:
Create Date: 2026-10-23

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261023_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("role", sa.Enum("user", "admin", name="userrole"), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "plans",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("max_minutes_month", sa.Integer(), nullable=False),
        sa.Column("max_storage_mb", sa.Integer(), nullable=False),
        sa.Column("max_concurrent_jobs", sa.Integer(), nullable=False),
        sa.Column("features", sa.JSON(), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("code"),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("user_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("plan_id", sa.CHAR(36), sa.ForeignKey("plans.id"), nullable=False),
        sa.Column("status", sa.Enum("active", "past_due", "cancelled", name="subscriptionstatus"), nullable=False),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_subscriptions_user_status", "subscriptions", ["user_id", "status"])

    op.create_table(
        "projects",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("bpm", sa.Numeric(8, 2), nullable=True),
        sa.Column("musical_key", sa.String(16), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_projects_owner_created", "projects", ["owner_id", "created_at"])

    op.create_table(
        "audio_assets",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("project_id", sa.CHAR(36), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("kind", sa.Enum("original", "stem", "proxy", "export", name="assetkind"), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("mime_type", sa.String(128), nullable=False),
        sa.Column("format", sa.String(32), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("sample_rate", sa.Integer(), nullable=True),
        sa.Column("channels", sa.Integer(), nullable=True),
        sa.Column("original_filename", sa.String(255), nullable=True),
        sa.Column("status", sa.Enum("pending", "ready", "failed", name="assetstatus"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audio_assets_owner_project", "audio_assets", ["owner_id", "project_id"])

    op.create_table(
        "processing_models",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("stem_layout", sa.JSON(), nullable=False),
        sa.Column("license", sa.String(64), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("min_vram_mb", sa.Integer(), nullable=False),
        sa.Column("params_schema", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("code"),
    )

    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("project_id", sa.CHAR(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("source_asset_id", sa.CHAR(36), sa.ForeignKey("audio_assets.id"), nullable=False),
        sa.Column("model_id", sa.CHAR(36), sa.ForeignKey("processing_models.id"), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "queued",
                "preparing",
                "processing",
                "postprocessing",
                "completed",
                "failed",
                "cancelled",
                name="jobstatus",
            ),
            nullable=False,
        ),
        sa.Column("progress", sa.Numeric(5, 2), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("model_version", sa.String(64), nullable=False),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("billed_usage_id", sa.CHAR(36), nullable=True),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_processing_jobs_idempotency"),
    )
    op.create_index("ix_processing_jobs_owner_status", "processing_jobs", ["owner_id", "status"])

    op.create_table(
        "stems",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("job_id", sa.CHAR(36), sa.ForeignKey("processing_jobs.id"), nullable=False),
        sa.Column("project_id", sa.CHAR(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("stem_type", sa.Enum("vocals", "drums", "bass", "other", name="stemtype"), nullable=False),
        sa.Column("asset_id", sa.CHAR(36), sa.ForeignKey("audio_assets.id"), nullable=False),
        sa.Column("proxy_asset_id", sa.CHAR(36), sa.ForeignKey("audio_assets.id"), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_stems_project_job", "stems", ["project_id", "job_id"])

    op.create_table(
        "mix_presets",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("project_id", sa.CHAR(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("state", sa.JSON(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mix_presets_project", "mix_presets", ["project_id", "owner_id"])

    op.create_table(
        "markers",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("project_id", sa.CHAR(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("position_ms", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("color", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_markers_project_id", "markers", ["project_id"])

    op.create_table(
        "loop_regions",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("project_id", sa.CHAR(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("start_ms", sa.Integer(), nullable=False),
        sa.Column("end_ms", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_loop_regions_project_id", "loop_regions", ["project_id"])

    op.create_table(
        "practice_sessions",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("project_id", sa.CHAR(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "profile",
            sa.Enum("singer", "drums", "bass", "guitar", "keys", "general", name="practiceprofile"),
            nullable=False,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("duration_sec", sa.Integer(), nullable=False),
        sa.Column("metronome_bpm", sa.Integer(), nullable=True),
        sa.Column("speed_pct", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_practice_sessions_owner", "practice_sessions", ["owner_id", "created_at"])

    op.create_table(
        "export_jobs",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("project_id", sa.CHAR(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.Enum("stem", "stems_zip", "mixdown", name="exportkind"), nullable=False),
        sa.Column(
            "status",
            sa.Enum("queued", "processing", "completed", "failed", name="exportstatus"),
            nullable=False,
        ),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("result_asset_id", sa.CHAR(36), sa.ForeignKey("audio_assets.id"), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_export_jobs_idempotency"),
    )

    op.create_table(
        "usage_ledger",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("user_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("job_id", sa.CHAR(36), sa.ForeignKey("processing_jobs.id"), nullable=True),
        sa.Column(
            "kind",
            sa.Enum("separation_minutes", "export", "storage", name="usagekind"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Numeric(18, 4), nullable=False),
        sa.Column("unit", sa.Enum("minutes", "bytes", "count", name="usageunit"), nullable=False),
        sa.Column("period_ym", sa.CHAR(7), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("job_id", name="uq_usage_ledger_job"),
    )
    op.create_index("ix_usage_ledger_user_period", "usage_ledger", ["user_id", "period_ym"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("actor_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("resource_type", sa.String(64), nullable=False),
        sa.Column("resource_id", sa.CHAR(36), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_actor_created", "audit_logs", ["actor_id", "created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("usage_ledger")
    op.drop_table("export_jobs")
    op.drop_table("practice_sessions")
    op.drop_table("loop_regions")
    op.drop_table("markers")
    op.drop_table("mix_presets")
    op.drop_table("stems")
    op.drop_table("processing_jobs")
    op.drop_table("processing_models")
    op.drop_table("audio_assets")
    op.drop_table("projects")
    op.drop_table("subscriptions")
    op.drop_table("plans")
    op.drop_table("users")
