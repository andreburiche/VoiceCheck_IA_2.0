"""Validação do esquema da anamnese vocal (sem banco)."""

import pytest
from pydantic import ValidationError

from app.schemas.voz_clinica import AnamneseEntrada


def test_aceita_anamnese_parcial_e_limpa_espacos():
    a = AnamneseEntrada(paciente="Ana", queixa="  rouquidão no fim do dia  ", sintomas=["rouquidao", "pigarro"])
    assert a.queixa == "rouquidão no fim do dia"
    assert a.uso_profissional is None


def test_aceita_so_um_campo_booleano():
    assert AnamneseEntrada(paciente="Ana", refluxo=False).refluxo is False


@pytest.mark.parametrize(
    "extra",
    [
        {},  # nada preenchido
        {"queixa": "   "},  # só espaços
        {"sintomas": ["rouquidao", "rouquidao"]},
        {"sintomas": ["inventado"]},
        {"horas_voz_dia": 25},
        {"agua_copos_dia": -1},
        {"tabagismo": "as vezes"},
        {"campo_desconhecido": 1},
        {"queixa": "x" * 1001},
    ],
)
def test_rejeita_entradas_invalidas(extra):
    with pytest.raises(ValidationError):
        AnamneseEntrada(paciente="Ana", **extra)
