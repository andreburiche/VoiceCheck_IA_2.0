"""esqueci minha senha: tokens de redefinição + users.password_changed_at

Revision ID: 20261028_0008
Revises: 20261027_0007
Create Date: 2026-10-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261028_0008"
down_revision: Union[str, None] = "20261027_0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.CHAR(36), primary_key=True),
        sa.Column("user_id", sa.CHAR(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_ip", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_password_reset_user", "password_reset_tokens", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_password_reset_user", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_column("users", "password_changed_at")
