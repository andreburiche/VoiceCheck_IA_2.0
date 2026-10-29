"""voicecheck diagnoses: versão afinada (autotune)

Revision ID: 20261027_0006
Revises: 20261027_0005
Create Date: 2026-10-27

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261027_0006"
down_revision: Union[str, None] = "20261027_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("voicecheck_diagnoses", sa.Column("corrected_key", sa.String(512), nullable=True))
    op.add_column(
        "voicecheck_diagnoses",
        sa.Column("corrected_size", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("voicecheck_diagnoses", sa.Column("autotune", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("voicecheck_diagnoses", "autotune")
    op.drop_column("voicecheck_diagnoses", "corrected_size")
    op.drop_column("voicecheck_diagnoses", "corrected_key")
