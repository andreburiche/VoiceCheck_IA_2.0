"""Dados dos gráficos: onda com voz/sem voz, contorno de F0 e intensidade, espectro FFT + LPC."""

import json

import numpy as np
import pytest

from app.services import voz_clinica
from app.services.voz_clinica import graficos
from app.services.voz_clinica.audio import Audio
from voz_clinica_sintese import sintetizar

TAXA = 44100
FORMANTES = [(700, 80), (1220, 90), (2600, 120)]


def _com_silencio() -> Audio:
    voz = sintetizar(f0=200, dur=2.0, taxa=TAXA, formantes=FORMANTES).audio.amostras
    sil = 1e-4 * np.random.default_rng(0).standard_normal(int(0.5 * TAXA))
    return Audio(np.concatenate((sil, voz, sil)), TAXA)


@pytest.mark.parametrize("motor", voz_clinica.motores_disponiveis())
def test_graficos_na_analise(motor):
    r = voz_clinica.analisar(_com_silencio(), motor=motor, f0_min=75, f0_max=600)
    g = r["graficos"]
    onda = g["onda"]
    assert len(onda["min"]) == len(onda["max"]) == len(onda["voz"]) == 600
    # silêncio nas pontas (0,5 s de 3 s = colunas 0-99 e 500-599), voz no meio
    assert not any(onda["voz"][:90]) and not any(onda["voz"][510:])
    assert sum(onda["voz"][110:490]) > 360

    c = g["contorno"]
    f0 = [v for v in c["f0_hz"] if v is not None]
    assert len(c["f0_hz"]) == len(c["db"]) == pytest.approx(150, abs=1)
    assert np.median(f0) == pytest.approx(200, rel=0.02)
    assert c["f0_hz"][5] is None and max(c["db"][40:100]) - min(c["db"][:20]) > 40

    e = g["espectro"]
    assert len(e["freq_hz"]) == len(e["fft_db"]) == len(e["lpc_db"]) == 250
    assert max(e["fft_db"]) == 0 and max(e["lpc_db"]) == 0
    # o envelope LPC acha os formantes sintéticos
    for alvo in (700, 1220, 2600):
        assert min(abs(p - alvo) for p in e["picos_lpc_hz"]) < 120, (alvo, e["picos_lpc_hz"])
    assert len(json.dumps(g)) < 40_000  # cabe no resultado salvo


def test_sem_voz_nao_tem_espectro():
    a = Audio(1e-3 * np.random.default_rng(1).standard_normal(TAXA), TAXA)
    t = np.arange(0.01, 1, 0.01)
    g = graficos.montar(a, t, np.full(len(t), np.nan))
    assert "espectro" not in g and not any(g["onda"]["voz"]) and all(v is None for v in g["contorno"]["f0_hz"])
