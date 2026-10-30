"""VoiceCheck IA 2.0: arquivos que o storage não apagou, para nova tentativa

Revision ID: 20261030_0015
Revises: 20261030_0014
Create Date: 2026-10-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261030_0015"
down_revision: Union[str, None] = "20261030_0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "storage_pending_deletes",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_error", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("storage_key", name="uq_storage_pending_deletes_key"),
    )


def downgrade() -> None:
    op.drop_table("storage_pending_deletes")
