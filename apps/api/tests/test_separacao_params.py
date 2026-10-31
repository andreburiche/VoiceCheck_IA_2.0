"""Parâmetros da separação de instrumentos: só os conhecidos, nos limites (viram argumentos do Demucs)."""

import pytest
from pydantic import ValidationError

from app.services.separacao import MODELOS, ParametrosSeparacao, opcoes_demucs, tempo_limite_s


def test_modelos_e_faixas() -> None:
    assert MODELOS["htdemucs_6s"][1] == ("vocals", "drums", "bass", "guitar", "piano", "other")
    assert MODELOS["htdemucs_two"][1] == ("vocals", "instrumental")
    assert MODELOS["htdemucs_ft"][0] == "htdemucs_ft"


def test_qualidade_e_avancado() -> None:
    assert opcoes_demucs({}) == (0, 0.25)
    assert opcoes_demucs({"qualidade": "equilibrada"}) == (1, 0.25)
    assert opcoes_demucs({"qualidade": "maxima"}) == (2, 0.5)
    assert opcoes_demucs({"qualidade": "rapida", "shifts": 3, "overlap": 0.333}) == (3, 0.33)
    assert ParametrosSeparacao.model_validate({"preview_seconds": 15}).preview_seconds == 15


@pytest.mark.parametrize("ruim", [
    {"qualidade": "ultra"}, {"shifts": 6}, {"shifts": -1}, {"overlap": 0.05}, {"overlap": 0.9},
    {"preview_seconds": 0}, {"preview_seconds": 500}, {"modelo": "htdemucs; rm -rf /"}, {"device": "cuda"},
])
def test_recusa_o_que_nao_conhece_ou_passa_do_limite(ruim: dict) -> None:
    with pytest.raises(ValidationError):
        ParametrosSeparacao.model_validate(ruim)


def test_tempo_limite_para_arquivo_de_uma_hora() -> None:
    assert tempo_limite_s("htdemucs", 3 * 60_000, 0) == 1800
    uma_hora = tempo_limite_s("htdemucs_ft", 60 * 60_000, 2)
    assert 1800 < uma_hora <= 6 * 3600
