"""Aceite dos Termos e da Política de Privacidade no cadastro (LGPD art. 8º e 9º)

Revision ID: 20261031_0018
Revises: 20261031_0017
Create Date: 2026-10-31

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261031_0018"
down_revision: Union[str, None] = "20261031_0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("privacy_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("privacy_version", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "privacy_version")
    op.drop_column("users", "privacy_accepted_at")
