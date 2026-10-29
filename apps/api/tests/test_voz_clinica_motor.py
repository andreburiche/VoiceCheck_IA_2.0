"""VoiceCheck IA 2.0 — motor interno de análise acústica com vozes sintéticas de valores conhecidos."""

import numpy as np
import pytest

from app.services.voz_clinica import motor_interno
from app.services.voz_clinica.audio import Audio

from voz_clinica_sintese import sintetizar


@pytest.mark.parametrize("f0", [100.0, 150.0, 220.0, 330.0])
def test_f0_media_sem_erro_de_oitava(f0):
    r = motor_interno.analisar(sintetizar(f0=f0).audio)
    assert r["f0"]["media_hz"] == pytest.approx(f0, rel=0.01)
    assert r["fonacao"]["quebras_de_voz"] == 0


def test_vogal_com_ruido_sem_quadro_uma_oitava_abaixo():
    voz = sintetizar(f0=180, sj=0.008, sa=0.04, ruido=0.01,
                     formantes=[(700, 80), (1200, 90), (2600, 120)])
    f0 = motor_interno.analisar(voz.audio)["f0"]
    assert f0["min_hz"] > 150
    assert f0["faixa_semitons"] < 3


def test_correcao_de_oitava_isolada():
    f0s = np.array([200.0] * 10 + [100.0] + [200.0] * 10)
    corrigido = motor_interno.corrigir_oitavas(f0s, 75, 600)
    assert np.all(corrigido == 200.0)


def test_mudanca_real_de_altura_nao_e_corrigida():
    # glissando de uma oitava em 2 s: subida contínua não é erro
    f0s = np.geomspace(150, 300, 200)
    assert np.allclose(motor_interno.corrigir_oitavas(f0s, 75, 600), f0s)


@pytest.mark.parametrize("silencio_amostras", [150, 300, 2000])
def test_silencio_no_inicio_nao_impede_jitter(silencio_amostras):
    # gravações do navegador começam com alguns ms de silêncio
    voz = sintetizar(f0=220, sj=0.01, ruido=0.002, formantes=[(800, 80), (1300, 90), (2700, 120)])
    x = np.concatenate([np.zeros(silencio_amostras), voz.audio.amostras])
    p = motor_interno.analisar(Audio(x, voz.audio.taxa), 100, 600)["perturbacao"]
    assert p, "jitter/shimmer não calculados"
    assert p["ciclos"] > 500


def test_ciclo_irregular_no_meio_nao_descarta_o_resto():
    voz = sintetizar(f0=150, sj=0.01)
    x = voz.audio.amostras.copy()
    meio = len(x) // 2
    x[meio : meio + 400] = np.random.default_rng(7).standard_normal(400) * 0.2  # ~1 ciclo de ruído
    p = motor_interno.analisar(Audio(x, voz.audio.taxa))["perturbacao"]
    assert p["ciclos"] > 0.9 * len(voz.periodos)


def test_voz_limpa_tem_perturbacao_quase_nula():
    p = motor_interno.analisar(sintetizar().audio)["perturbacao"]
    assert p["jitter_local_pct"] < 0.1
    assert p["shimmer_local_pct"] < 0.2


@pytest.mark.parametrize("sj", [0.005, 0.01, 0.02])
def test_jitter_acompanha_o_valor_sintetizado(sj):
    voz = sintetizar(sj=sj)
    medido = motor_interno.analisar(voz.audio)["perturbacao"]["jitter_local_pct"]
    assert medido == pytest.approx(voz.jitter_local_pct, rel=0.05)


@pytest.mark.parametrize("f0", [100.0, 220.0, 330.0])
def test_jitter_em_varias_alturas(f0):
    voz = sintetizar(f0=f0, sj=0.01)
    medido = motor_interno.analisar(voz.audio)["perturbacao"]["jitter_local_pct"]
    assert medido == pytest.approx(voz.jitter_local_pct, rel=0.05)


def test_jitter_em_vogal_com_formantes():
    # a ressonância desloca o pico de cada ciclo: tolerância maior, como em voz real
    voz = sintetizar(f0=120, sj=0.01, formantes=[(700, 80), (1200, 90), (2600, 120)])
    medido = motor_interno.analisar(voz.audio)["perturbacao"]["jitter_local_pct"]
    assert medido == pytest.approx(voz.jitter_local_pct, rel=0.2)


@pytest.mark.parametrize("sa", [0.03, 0.06, 0.1])
def test_shimmer_acompanha_o_valor_sintetizado(sa):
    voz = sintetizar(sa=sa)
    medido = motor_interno.analisar(voz.audio)["perturbacao"]["shimmer_local_pct"]
    assert medido == pytest.approx(voz.shimmer_local_pct, rel=0.05)


def test_hnr_e_cpps_caem_com_ruido():
    resultados = [motor_interno.analisar(sintetizar(ruido=r).audio) for r in (0.0, 0.02, 0.08)]
    hnr = [r["ruido"]["hnr_db"] for r in resultados]
    cpps = [r["cpps_db"] for r in resultados]
    assert hnr[0] > hnr[1] > hnr[2]
    assert cpps[0] > cpps[1] > cpps[2]


def test_formantes_de_vogal_sintetica():
    voz = sintetizar(f0=120, formantes=[(700, 80), (1200, 90), (2600, 120)])
    f = motor_interno.analisar(voz.audio)["formantes"]
    assert f["f1_hz"] == pytest.approx(700, rel=0.08)
    assert f["f2_hz"] == pytest.approx(1200, rel=0.08)


def test_tmf_e_quebra_de_voz():
    voz = sintetizar(dur=2.0).audio
    silencio = np.zeros(int(0.3 * voz.taxa))
    com_quebra = Audio(np.concatenate([voz.amostras, silencio, voz.amostras]), voz.taxa)
    r = motor_interno.analisar(com_quebra)
    assert r["fonacao"]["quebras_de_voz"] == 1
    assert r["fonacao"]["tmf_s"] == pytest.approx(2.0, abs=0.1)


def test_ruido_puro_nao_e_voz():
    rng = np.random.default_rng(3)
    r = motor_interno.analisar(Audio(0.3 * rng.standard_normal(44100 * 2), 44100))
    assert "f0" not in r
    assert "voz suficiente" in r["avisos"][0]


def test_aviso_de_saturacao():
    voz = sintetizar().audio
    saturado = Audio(np.clip(voz.amostras * 10, -1, 1), voz.taxa)  # pico ~2,2 cortado em 1
    assert any("saturou" in a for a in motor_interno.analisar(saturado)["avisos"])
