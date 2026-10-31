"""Perfil profissional do usuário (fonoaudiólogo, professor de música, músico) e Meu perfil

Revision ID: 20261031_0016
Revises: 20261030_0015
Create Date: 2026-10-31

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261031_0016"
down_revision: Union[str, None] = "20261030_0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("profile_kind", sa.String(24), nullable=True))
    op.add_column("users", sa.Column("profile_data", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("photo_key", sa.String(255), nullable=True))
    # Quem já usava a avaliação clínica continua com acesso: perfil de fonoaudiólogo
    # para quem tem avaliações clínicas salvas; os demais escolhem em Meu perfil.
    op.execute(
        "UPDATE users SET profile_kind = 'fonoaudiologo' "
        "WHERE profile_kind IS NULL AND id IN (SELECT DISTINCT owner_id FROM clinical_evaluations)"
    )


def downgrade() -> None:
    op.drop_column("users", "photo_key")
    op.drop_column("users", "profile_data")
    op.drop_column("users", "profile_kind")
