"""VoiceCheck IA 2.0: cadastro do paciente (data de nascimento, sexo, contato, profissão)

Revision ID: 20261030_0013
Revises: 20261030_0012
Create Date: 2026-10-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261030_0013"
down_revision: Union[str, None] = "20261030_0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "voice_patients",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("sex", sa.String(16), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("occupation", sa.String(120), nullable=True),
        sa.Column("voice_professional", sa.Boolean(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.UniqueConstraint("owner_id", "name", name="uq_voice_patients_owner_name"),
    )


def downgrade() -> None:
    op.drop_table("voice_patients")
