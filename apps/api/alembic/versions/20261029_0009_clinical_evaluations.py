"""VoiceCheck IA 2.0: avaliações clínicas da voz (acústica e protocolos)

Revision ID: 20261029_0009
Revises: 20261028_0008
Create Date: 2026-10-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261029_0009"
down_revision: Union[str, None] = "20261028_0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clinical_evaluations",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("patient_name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("engine", sa.String(16), nullable=True),
        sa.Column("result", sa.JSON(), nullable=False),
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
        "ix_clinical_evaluations_owner_patient",
        "clinical_evaluations",
        ["owner_id", "patient_name", "created_at"],
    )


def downgrade() -> None:
    # o índice composto serve à chave estrangeira owner_id (MySQL recusa apagá-lo antes): sai com a tabela
    op.drop_table("clinical_evaluations")
