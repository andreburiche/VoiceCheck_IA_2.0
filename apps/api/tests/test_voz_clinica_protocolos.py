"""VoiceCheck IA 2.0 — escore dos protocolos IDV-10, QVV e GRBASI."""

import pytest

from app.services.voz_clinica import protocolos as p


# ---- IDV-10 ---------------------------------------------------------------

def test_idv10_soma_e_corte():
    assert p.idv10([0] * 10)["total"] == 0
    assert p.idv10([4] * 10)["total"] == 40
    abaixo = p.idv10([1] * 7 + [0] * 3)   # 7 pontos
    acima = p.idv10([1] * 8 + [0] * 2)    # 8 pontos
    assert not abaixo["acima_do_corte"]
    assert acima["acima_do_corte"]


@pytest.mark.parametrize("ruim", [[0] * 9, [0] * 11, [5] + [0] * 9, [-1] + [0] * 9, [1.5] + [0] * 9, [True] + [0] * 9, "0000000000"])
def test_idv10_rejeita_respostas_invalidas(ruim):
    with pytest.raises(p.ErroProtocolo):
        p.idv10(ruim)


# ---- QVV ------------------------------------------------------------------

def test_qvv_extremos():
    melhor = p.qvv([1] * 10)
    pior = p.qvv([5] * 10)
    for chave in ("total", "fisico", "socioemocional"):
        assert melhor[chave] == 100
        assert pior[chave] == 0


def test_qvv_valor_intermediario():
    # todos os itens em 3: bruto 30 -> 100 - (30-10)/40*100 = 50
    r = p.qvv([3] * 10)
    assert r["total"] == 50
    assert r["fisico"] == 50
    assert r["socioemocional"] == 50


def test_qvv_separa_os_dominios():
    # só os itens socioemocionais (4, 5, 8, 10) em 5
    respostas = [1] * 10
    for i in p.QVV_SOCIOEMOCIONAL:
        respostas[i - 1] = 5
    r = p.qvv(respostas)
    assert r["fisico"] == 100
    assert r["socioemocional"] == 0
    assert r["total"] == 60  # bruto 26 -> 100 - 16/40*100
    assert r["itens_com_problema"] == [4, 5, 8, 10]


def test_qvv_dominios_cobrem_os_10_itens_sem_repetir():
    assert sorted(p.QVV_FISICO + p.QVV_SOCIOEMOCIONAL) == list(range(1, 11))


def test_qvv_corte():
    assert not p.qvv([1] * 10)["abaixo_do_corte"]
    assert p.qvv([2] * 10)["abaixo_do_corte"]  # 75 pontos


# ---- GRBASI ---------------------------------------------------------------

def test_grbasi_registro():
    r = p.grbasi({"G": 2, "R": 1, "B": 2, "A": 0, "S": 1, "I": 0})
    assert r["registro"] == "G2R1B2A0S1I0"
    assert r["parametros"]["B"]["nivel"] == "moderado"


def test_grbasi_parametro_faltando():
    with pytest.raises(p.ErroProtocolo, match="I"):
        p.grbasi({"G": 1, "R": 1, "B": 1, "A": 1, "S": 1})


def test_grbasi_nota_fora_da_escala():
    with pytest.raises(p.ErroProtocolo):
        p.grbasi({"G": 4, "R": 1, "B": 1, "A": 1, "S": 1, "I": 1})
