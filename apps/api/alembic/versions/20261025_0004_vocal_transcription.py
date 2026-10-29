"""vocal transcription lab tables

Revision ID: 20261025_0004
Revises: 20261024_0003
Create Date: 2026-10-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261025_0004"
down_revision: Union[str, None] = "20261024_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vocal_transcriptions",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("project_id", sa.CHAR(36), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_asset_id", sa.CHAR(36), sa.ForeignKey("audio_assets.id"), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "ready",
                "needs_review",
                "failed",
                name="vocaltranscriptionstatus",
            ),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("engine", sa.String(64), nullable=False, server_default="client_yin_v1"),
        sa.Column("bpm", sa.Numeric(8, 2), nullable=True),
        sa.Column("musical_key", sa.String(16), nullable=True),
        sa.Column("confidence", sa.Numeric(5, 4), nullable=True),
        sa.Column("polyphony_warning", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("meta", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_vocal_transcriptions_project",
        "vocal_transcriptions",
        ["project_id", "owner_id"],
    )

    op.create_table(
        "vocal_parts",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column(
            "transcription_id",
            sa.CHAR(36),
            sa.ForeignKey("vocal_transcriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column(
            "voice_role",
            sa.Enum(
                "unassigned",
                "principal",
                "segunda",
                "terceira",
                "quarta",
                "soprano",
                "contralto",
                "tenor",
                "baixo",
                name="vocalvoicerole",
            ),
            nullable=False,
            server_default="principal",
        ),
        sa.Column("needs_review", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("audio_asset_id", sa.CHAR(36), sa.ForeignKey("audio_assets.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_vocal_parts_transcription", "vocal_parts", ["transcription_id"])

    op.create_table(
        "transcription_notes",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column(
            "part_id",
            sa.CHAR(36),
            sa.ForeignKey("vocal_parts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("pitch_midi", sa.Integer(), nullable=False),
        sa.Column("start_ms", sa.Integer(), nullable=False),
        sa.Column("end_ms", sa.Integer(), nullable=False),
        sa.Column("velocity", sa.Integer(), nullable=False, server_default="80"),
        sa.Column("is_rest", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("tie_group", sa.String(36), nullable=True),
        sa.Column("lyric_syllable", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_transcription_notes_part_start", "transcription_notes", ["part_id", "start_ms"])

    op.create_table(
        "score_versions",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column(
            "transcription_id",
            sa.CHAR(36),
            sa.ForeignKey("vocal_transcriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("musicxml", sa.Text(), nullable=True),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("label", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("transcription_id", "version", name="uq_score_versions_tx_ver"),
    )


def downgrade() -> None:
    op.drop_table("score_versions")
    op.drop_table("transcription_notes")
    op.drop_table("vocal_parts")
    op.drop_table("vocal_transcriptions")
