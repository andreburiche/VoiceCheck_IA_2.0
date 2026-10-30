"""VoiceCheck IA 2.0: anotação do profissional em cada avaliação (como o editor do VoxMetria)

Revision ID: 20261030_0012
Revises: 20261030_0011
Create Date: 2026-10-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261030_0012"
down_revision: Union[str, None] = "20261030_0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clinical_evaluations", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("clinical_evaluations", "notes")
