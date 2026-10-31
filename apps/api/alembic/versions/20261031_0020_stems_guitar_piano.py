"""Faixas de guitarra e piano (modelo de 6 instrumentos, htdemucs_6s)

Revision ID: 20261031_0020
Revises: 20261031_0019
Create Date: 2026-10-31

"""

from typing import Sequence, Union

from alembic import op

revision: str = "20261031_0020"
down_revision: Union[str, None] = "20261031_0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "mysql":
        return  # SQLite guarda o enum como texto
    op.execute(
        "ALTER TABLE stems MODIFY COLUMN stem_type "
        "ENUM('vocals','drums','bass','other','instrumental','guitar','piano') NOT NULL"
    )


def downgrade() -> None:
    if op.get_bind().dialect.name != "mysql":
        return
    op.execute("UPDATE stems SET stem_type='other' WHERE stem_type IN ('guitar','piano')")
    op.execute(
        "ALTER TABLE stems MODIFY COLUMN stem_type "
        "ENUM('vocals','drums','bass','other','instrumental') NOT NULL"
    )
