"""Nuvem de pontos do Diagrama de Desvio Fonatório: um ponto por trecho de 0,5 s."""

from app.services.voz_clinica import ddf_segmentos, motor_interno
from voz_clinica_sintese import sintetizar

TAXA = 44100
FORMANTES = [(700, 80), (1220, 90), (2600, 120)]


def test_janelas_cobrem_a_voz_sem_trecho_curto():
    j = ddf_segmentos.janelas([(0.2, 3.1)], duracao=4.0)
    assert j[0][0] == 0.2 and j[-1][1] == 3.1
    assert all(b - a >= ddf_segmentos.MINIMO_S - 1e-9 for a, b in j)
    assert all(b - a <= ddf_segmentos.TRECHO_S + ddf_segmentos.MINIMO_S + 1e-9 for a, b in j)
    # trechos seguidos, sem buraco
    assert all(abs(j[i][1] - j[i + 1][0]) < 1e-9 for i in range(len(j) - 1))


def test_janelas_ignoram_voz_curta_e_respeitam_o_limite():
    assert ddf_segmentos.janelas([(0.0, 0.2)], duracao=1.0) == []
    assert len(ddf_segmentos.janelas([(0.0, 60.0)], duracao=60.0)) == ddf_segmentos.MAX_TRECHOS


def _analise(**kw):
    return motor_interno.analisar(sintetizar(f0=150, dur=3, taxa=TAXA, formantes=FORMANTES, **kw).audio)


def test_motor_interno_devolve_pontos_por_trecho():
    r = _analise()
    pts = r["ddf_segmentos"]
    assert len(pts) >= 4
    for p in pts:
        assert set(p) == {"inicio_s", "fim_s", "jitter_pct", "shimmer_pct", "gne"}
        assert p["jitter_pct"] < 0.5 and p["gne"] > 0.9


def test_voz_irregular_espalha_e_sobe_a_nuvem():
    limpa = _analise()["ddf_segmentos"]
    irregular = _analise(sj=0.02, sa=0.1)["ddf_segmentos"]
    media = lambda pts, k: sum(p[k] for p in pts) / len(pts)  # noqa: E731
    assert media(irregular, "jitter_pct") > media(limpa, "jitter_pct") + 0.5
    assert media(irregular, "shimmer_pct") > media(limpa, "shimmer_pct")


def test_trecho_com_erro_e_pulado():
    a = sintetizar(f0=150, dur=2, taxa=TAXA, formantes=FORMANTES).audio

    def falha(ini, fim):
        if ini < 0.5:
            raise ValueError("trecho ruim")
        return (0.3, 2.0)

    pts = ddf_segmentos.medir(a.amostras, TAXA, [(0.0, 2.0)], falha)
    assert pts and all(p["inicio_s"] >= 0.5 for p in pts)
