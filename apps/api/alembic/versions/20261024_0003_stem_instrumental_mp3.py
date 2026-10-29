"""stem_type instrumental + export mp3 notes

Revision ID: 20261024_0003
Revises: 20261024_0002
Create Date: 2026-10-24

"""

from typing import Sequence, Union

from alembic import op

revision: str = "20261024_0003"
down_revision: Union[str, None] = "20261024_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # MySQL ENUM: adiciona instrumental para jobs 2-stem (vocals + instrumental).
    op.execute(
        "ALTER TABLE stems MODIFY COLUMN stem_type "
        "ENUM('vocals','drums','bass','other','instrumental') NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE stems SET stem_type='other' WHERE stem_type='instrumental'"
    )
    op.execute(
        "ALTER TABLE stems MODIFY COLUMN stem_type "
        "ENUM('vocals','drums','bass','other') NOT NULL"
    )
