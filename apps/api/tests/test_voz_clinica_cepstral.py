"""Análise cepstral da vogal e da frase (CPP/CPPS) e AVQI com vozes sintéticas."""

import numpy as np
import pytest

from app.services import voz_clinica
from app.services.voz_clinica import cepstral, motor_praat
from app.services.voz_clinica.audio import Audio
from test_voz_clinica_fala import _frases
from voz_clinica_sintese import sintetizar

TAXA = 44100
FORMANTES = [(530, 80), (1840, 100), (2480, 120)]  # /ɛ/ aproximado


def _vogal(ruido=0.0, sa=0.0, sj=0.0) -> Audio:
    return sintetizar(f0=200, dur=4, taxa=TAXA, formantes=FORMANTES, ruido=ruido, sa=sa, sj=sj).audio


def _frase(ruido=0.0) -> Audio:
    a = _frases(f0=200, semitons=3, n=4, frase_s=0.6, pausa_s=0.2)
    rng = np.random.default_rng(3)
    return Audio(a.amostras + ruido * rng.standard_normal(len(a.amostras)), a.taxa)


@pytest.mark.parametrize("motor", voz_clinica.motores_disponiveis())
def test_cpp_e_cpps_caem_com_ruido(motor):
    limpa = cepstral.analisar_cepstral(_vogal(), _frase(), motor=motor)
    ruidosa = cepstral.analisar_cepstral(_vogal(ruido=0.08), _frase(ruido=0.08), motor=motor)
    for parte in ("vogal", "frase"):
        for medida in ("cpp_db", "cpps_db"):
            assert limpa[parte][medida] > ruidosa[parte][medida] + 1, (parte, medida, limpa[parte], ruidosa[parte])
    # na frase há pausas e transições: CPPS menor que na vogal
    assert limpa["frase"]["cpps_db"] < limpa["vogal"]["cpps_db"]
    assert limpa["motor"] == motor


def test_interno_avisa_que_avqi_e_so_praat():
    r = cepstral.analisar_cepstral(_vogal(), _frase(), motor="interno")
    assert "avqi" not in r and any("AVQI" in a for a in r["avisos"])


@pytest.mark.skipif(not motor_praat.DISPONIVEL, reason="Praat (parselmouth) não instalado")
def test_avqi_sobe_com_desvio_da_voz():
    # "saudável": pequenas perturbações naturais; "desviada": ruído e shimmer altos
    saudavel = cepstral.analisar_cepstral(_vogal(ruido=0.005, sa=0.03, sj=0.004), _frase(ruido=0.005), motor="praat")
    desviada = cepstral.analisar_cepstral(_vogal(ruido=0.1, sa=0.15, sj=0.02), _frase(ruido=0.1), motor="praat")
    a, b = saudavel["avqi"], desviada["avqi"]
    assert set(a["componentes"]) == {"cpps_db", "hnr_db", "shimmer_pct", "shimmer_db", "slope_db", "tilt_db"}
    assert b["valor"] > a["valor"] + 1, (a, b)
    # 3 s centrais da vogal + trechos sonoros da frase (pausas fora)
    assert 3.5 < a["duracao_analisada_s"] < 3 + _frase().duracao, a
    print("AVQI saudável:", a, "| desviada:", b)


def test_motor_invalido():
    with pytest.raises(ValueError):
        cepstral.analisar_cepstral(_vogal(), _frase(), motor="outro")
