"""VoiceCheck IA 2.0 — resumo do fonetograma no servidor (mesma regra do navegador)."""

from app.services.voz_clinica.fonetograma import hz_da_nota, nome_nota, resumir_campo


def test_nomes_e_frequencias():
    assert nome_nota(60) == "C4"
    assert nome_nota(69) == "A4"
    assert nome_nota(48) == "C3"
    assert hz_da_nota(69) == 440.0
    assert hz_da_nota(48) == 130.8


def test_resumo_do_campo():
    pontos = [{"midi": m, "min_db": -40.0, "max_db": -12.0} for m in range(48, 68)]  # C3 a G4
    r = resumir_campo(pontos)
    assert (r["nota_grave"], r["nota_aguda"]) == ("C3", "G4")
    assert r["extensao_st"] == 19
    assert r["semitons_alcancados"] == 20
    assert r["faixa_dinamica_media_db"] == 28.0
    assert r["area_st_db"] == 560.0


def test_campo_com_falha_no_meio_e_fora_de_ordem():
    pontos = [{"midi": 60, "min_db": -30, "max_db": -20}, {"midi": 50, "min_db": -35, "max_db": -15}]
    r = resumir_campo(pontos)
    assert r["extensao_st"] == 10
    assert r["semitons_alcancados"] == 2
    assert r["db_min"] == -35 and r["db_max"] == -15


def test_vazio():
    assert resumir_campo([])["extensao_st"] == 0
