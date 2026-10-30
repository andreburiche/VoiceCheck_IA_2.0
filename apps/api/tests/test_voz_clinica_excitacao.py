"""GNE e MWC (medidas do GHD) com vozes sintéticas de propriedades conhecidas."""

import numpy as np
import pytest

from app.services import voz_clinica
from app.services.voz_clinica import excitacao, motor_interno
from app.services.voz_clinica.audio import Audio
from voz_clinica_sintese import sintetizar

TAXA = 44100
FORMANTES = [(700, 80), (1220, 90), (2600, 120)]


def _medir(**kw):
    a = sintetizar(f0=150, dur=3, taxa=TAXA, formantes=FORMANTES, **kw).audio
    t, f, _ = motor_interno.rastrear_pitch(a, 75, 600)
    return excitacao.medir(a.amostras, TAXA, motor_interno._trechos_vozeados(t, f), motor_interno.marcar_ciclos(a, t, f))


def test_voz_periodica_limpa():
    r = _medir()
    assert r["gne"] >= 0.98 and r["mwc"] >= 0.98 and r["gne_janelas"] >= 20


def test_gne_cai_com_o_ruido_e_ruido_puro_e_baixo():
    valores = [_medir(ruido=n)["gne"] for n in (0.0, 0.05, 0.1, 0.2)]
    assert valores == sorted(valores, reverse=True), valores
    assert valores[-1] < 0.9
    rng = np.random.default_rng(0)
    assert excitacao.gne(0.1 * rng.standard_normal(3 * TAXA), TAXA, [(0, 3)])["gne"] < 0.5


def test_gne_separa_ruido_de_irregularidade():
    """No GHD o GNE é o eixo de ruído: jitter e shimmer quase não o mexem; o MWC sim."""
    irregular = _medir(sj=0.03)
    assert irregular["gne"] >= 0.97
    assert irregular["mwc"] < _medir()["mwc"] - 0.05


def test_sem_voz_nada_e_inventado():
    assert excitacao.medir(np.zeros(TAXA), TAXA, [], []) == {}


def test_juntar_pausas_curtas():
    # 50 ms de pausa juntam; 300 ms não
    assert excitacao._juntar([(1.2, 1.5), (0.0, 0.5), (0.55, 0.9)]) == [(0.0, 0.9), (1.2, 1.5)]


@pytest.mark.parametrize("motor", voz_clinica.motores_disponiveis())
def test_analise_traz_o_bloco_excitacao(motor):
    a = sintetizar(f0=180, dur=3, taxa=TAXA, ruido=0.02, formantes=FORMANTES).audio
    r = voz_clinica.analisar(a, motor=motor)
    assert 0.9 <= r["excitacao"]["gne"] <= 1.0 and 0.9 <= r["excitacao"]["mwc"] <= 1.0
