"""VoiceCheck IA 2.0: gravação guardada da análise acústica (ouvir e comparar antes/depois)

Revision ID: 20261030_0011
Revises: 20261029_0010
Create Date: 2026-10-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261030_0011"
down_revision: Union[str, None] = "20261029_0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("clinical_evaluations", sa.Column("audio_key", sa.String(255), nullable=True))
    op.add_column("clinical_evaluations", sa.Column("audio_bytes", sa.Integer(), nullable=True))


def downgrade() -> None:
    # os arquivos no storage não são apagados aqui (a migração não acessa o storage)
    op.drop_column("clinical_evaluations", "audio_bytes")
    op.drop_column("clinical_evaluations", "audio_key")
