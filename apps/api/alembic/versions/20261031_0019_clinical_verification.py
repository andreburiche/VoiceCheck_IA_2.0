"""Conferência do registro (CRFa) antes de liberar a área clínica

O perfil de fonoaudiólogo era só declarado: qualquer conta (inclusive de músico) entrava na
avaliação clínica escolhendo esse perfil. Agora o administrador aprova o registro.
Quem já era fonoaudiólogo continua com acesso (aprovado), para não trancar prontuários em uso.

Revision ID: 20261031_0019
Revises: 20261031_0018
Create Date: 2026-10-31

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261031_0019"
down_revision: Union[str, None] = "20261031_0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("clinical_status", sa.String(16), nullable=True))
    op.add_column("users", sa.Column("clinical_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("clinical_reviewed_by", sa.CHAR(36), nullable=True))
    op.add_column("users", sa.Column("clinical_review_note", sa.String(255), nullable=True))
    op.execute("UPDATE users SET clinical_status = 'aprovado' WHERE profile_kind = 'fonoaudiologo'")


def downgrade() -> None:
    op.drop_column("users", "clinical_review_note")
    op.drop_column("users", "clinical_reviewed_by")
    op.drop_column("users", "clinical_reviewed_at")
    op.drop_column("users", "clinical_status")
