"""project chords_hint

Revision ID: 20261024_0002
Revises: 20261023_0001
Create Date: 2026-10-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261024_0002"
down_revision: Union[str, None] = "20261023_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("chords_hint", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "chords_hint")
