"""VoiceCheck IA 2.0: prática em casa (planos por link) e id de sessão do celular

Revision ID: 20261029_0010
Revises: 20261029_0009
Create Date: 2026-10-29

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261029_0010"
down_revision: Union[str, None] = "20261029_0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "home_practice_plans",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("owner_id", sa.CHAR(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("patient_name", sa.String(120), nullable=False),
        sa.Column("greeting", sa.String(60), nullable=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("exercises", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
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
        "ix_home_practice_plans_owner_patient",
        "home_practice_plans",
        ["owner_id", "patient_name", "created_at"],
    )
    # Id da sessão gerado no celular: reenviar a mesma sessão (fila offline) não duplica.
    op.add_column("clinical_evaluations", sa.Column("client_ref", sa.String(36), nullable=True))
    op.create_unique_constraint(
        "uq_clinical_evaluations_owner_client_ref", "clinical_evaluations", ["owner_id", "client_ref"]
    )
    # Plano de origem: conta sessões por plano e por dia (teto contra inundar o histórico).
    op.add_column("clinical_evaluations", sa.Column("practice_plan_id", sa.CHAR(36), nullable=True))
    op.create_index(
        "ix_clinical_evaluations_plan_created", "clinical_evaluations", ["practice_plan_id", "created_at"]
    )
    op.create_foreign_key(
        "fk_clinical_evaluations_practice_plan",
        "clinical_evaluations",
        "home_practice_plans",
        ["practice_plan_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # No MySQL, a chave estrangeira sai antes do índice que ela usa.
    op.drop_constraint("fk_clinical_evaluations_practice_plan", "clinical_evaluations", type_="foreignkey")
    op.drop_index("ix_clinical_evaluations_plan_created", table_name="clinical_evaluations")
    op.drop_column("clinical_evaluations", "practice_plan_id")
    op.drop_constraint("uq_clinical_evaluations_owner_client_ref", "clinical_evaluations", type_="unique")
    op.drop_column("clinical_evaluations", "client_ref")
    # o índice composto serve à chave estrangeira owner_id: sai junto com a tabela
    op.drop_table("home_practice_plans")
