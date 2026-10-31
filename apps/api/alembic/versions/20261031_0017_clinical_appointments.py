"""VoiceCheck IA 2.0: agenda de consultas da avaliação clínica

Revision ID: 20261031_0017
Revises: 20261031_0016
Create Date: 2026-10-31

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = "20261031_0017"
down_revision: Union[str, None] = "20261031_0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# mesmo critério dos outros nomes de paciente (0014): comparação exata, sem juntar "Ana Lúcia" e "Ana Lucia"
NOME = sa.String(120).with_variant(mysql.VARCHAR(120, charset="utf8mb4", collation="utf8mb4_bin"), "mysql")


def upgrade() -> None:
    op.create_table(
        "clinical_appointments",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("patient_name", NOME, nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("kind", sa.String(16), nullable=False, server_default="terapia"),
        sa.Column("modality", sa.String(16), nullable=False, server_default="presencial"),
        sa.Column("status", sa.String(16), nullable=False, server_default="agendada"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_clinical_appointments_owner_start", "clinical_appointments", ["owner_id", "starts_at"])
    op.create_index("ix_clinical_appointments_owner_patient", "clinical_appointments", ["owner_id", "patient_name", "starts_at"])


def downgrade() -> None:
    # os índices saem junto com a tabela (no MySQL, o owner_start serve à chave estrangeira e não pode sair antes)
    op.drop_table("clinical_appointments")
