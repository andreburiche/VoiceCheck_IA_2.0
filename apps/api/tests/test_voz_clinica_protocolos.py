"""VoiceCheck IA 2.0 — escore dos protocolos IDV-10, QVV, GRBASI e EASE-BR."""

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


# ---------------------------------------------------------------------------
# EASE-BR (Rocha et al., 2014): 22 itens 0-3; itens 6, 12 e 21 invertidos
# ---------------------------------------------------------------------------

def test_easebr_sem_queixa_e_zero():
    # "não" nos negativos e "muito" nos positivos = nenhuma dificuldade
    r = p.easebr([3 if i in (6, 12, 21) else 0 for i in range(1, 23)])
    assert r["total"] == 0
    assert r["maximo"] == 66
    assert r["itens_com_queixa"] == []


def test_easebr_maximo_e_66():
    r = p.easebr([0 if i in (6, 12, 21) else 3 for i in range(1, 23)])
    assert r["total"] == 66
    assert r["itens_com_queixa"] == list(range(1, 23))


def test_easebr_inverte_so_os_itens_positivos():
    # tudo "não" (0): os 19 negativos valem 0 e os 3 positivos valem 3 cada
    assert p.easebr([0] * 22)["total"] == 9
    # tudo "muito" (3): 19 × 3 + 3 × 0
    assert p.easebr([3] * 22)["total"] == 57


def test_easebr_itens_com_queixa_usam_o_ponto_ja_invertido():
    respostas = [0] * 22
    respostas[0] = 2  # item 1 negativo, "moderadamente" → 2 pontos
    respostas[5] = 3  # item 6 positivo, "muito" → 0 pontos
    respostas[11] = 1  # item 12 positivo, "um pouco" → 2 pontos
    r = p.easebr(respostas)
    assert r["itens_com_queixa"] == [1, 12, 21]  # 21 marcado "não" → 3 pontos


def test_easebr_nao_tem_nota_de_corte():
    r = p.easebr([1] * 22)
    assert not any("corte" in chave for chave in r)


@pytest.mark.parametrize("ruim", [[0] * 21, [0] * 23, [0] * 21 + [4], [0] * 21 + [-1], [0] * 21 + [True], "x"])
def test_easebr_rejeita_respostas_invalidas(ruim):
    with pytest.raises(p.ErroProtocolo):
        p.easebr(ruim)
