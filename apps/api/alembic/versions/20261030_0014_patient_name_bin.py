"""VoiceCheck IA 2.0: nome do paciente com comparação exata (collation utf8mb4_bin)

O padrão do servidor (utf8mb4_unicode_ci) trata "Ana Lúcia" e "Ana Lucia", ou "P01" e "p01",
como o mesmo paciente: excluir um apagaria o outro e a exportação misturaria prontuários.
O aplicativo normaliza o nome (NFC) antes de gravar e de buscar.

Revision ID: 20261030_0014
Revises: 20261030_0013
Create Date: 2026-10-30

"""

from typing import Sequence, Union

from alembic import op

revision: str = "20261030_0014"
down_revision: Union[str, None] = "20261030_0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUNAS = (("clinical_evaluations", "patient_name"), ("home_practice_plans", "patient_name"), ("voice_patients", "name"))


def _alterar(collation: str) -> None:
    if op.get_bind().dialect.name != "mysql":
        return  # SQLite (testes) já compara bytes
    for tabela, coluna in COLUNAS:
        op.execute(f"ALTER TABLE {tabela} MODIFY {coluna} VARCHAR(120) CHARACTER SET utf8mb4 COLLATE {collation} NOT NULL")


def upgrade() -> None:
    _alterar("utf8mb4_bin")


def downgrade() -> None:
    # pode falhar se houver cadastros que só diferem em maiúsculas/acentos (o índice único volta a juntá-los)
    _alterar("utf8mb4_unicode_ci")
