"""voicecheck diagnoses registry

Revision ID: 20261027_0005
Revises: 20261025_0004
Create Date: 2026-10-27

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261027_0005"
down_revision: Union[str, None] = "20261025_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voicecheck_diagnoses",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("step", sa.String(16), nullable=False, server_default="importar"),
        sa.Column("max_reached", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("asset_meta", sa.JSON(), nullable=True),
        sa.Column("probe", sa.JSON(), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("analysis_source", sa.String(32), nullable=True),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("original_key", sa.String(512), nullable=True),
        sa.Column("original_mime", sa.String(128), nullable=True),
        sa.Column("original_filename", sa.String(255), nullable=True),
        sa.Column("original_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prepared_key", sa.String(512), nullable=True),
        sa.Column("prepared_size", sa.Integer(), nullable=False, server_default="0"),
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
        "ix_voicecheck_diagnoses_owner_updated",
        "voicecheck_diagnoses",
        ["owner_id", "updated_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_voicecheck_diagnoses_owner_updated", table_name="voicecheck_diagnoses")
    op.drop_table("voicecheck_diagnoses")
