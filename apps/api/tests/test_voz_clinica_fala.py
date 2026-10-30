"""F0 da fala com "frases" sintéticas de entonação conhecida."""

import numpy as np
import pytest

from app.services import voz_clinica
from app.services.voz_clinica import fala
from app.services.voz_clinica.audio import Audio

TAXA = 44100


def _frases(f0=180.0, semitons=4.0, n=5, frase_s=1.2, pausa_s=0.4, seed=0) -> Audio:
    """n frases com F0 oscilando ±semitons em torno de f0, separadas por silêncio."""
    rng = np.random.default_rng(seed)
    partes = []
    for k in range(n):
        t = np.arange(int(frase_s * TAXA)) / TAXA
        inst = f0 * 2 ** (semitons / 12 * np.sin(2 * np.pi * (t / frase_s + k / n)))
        fase = 2 * np.pi * np.cumsum(inst) / TAXA
        voz = sum(np.sin(h * fase) / h for h in range(1, 8))
        env = np.minimum(1, np.minimum(t, frase_s - t) / 0.03)
        partes += [0.3 * voz * env, 1e-4 * rng.standard_normal(int(pausa_s * TAXA))]
    return Audio(np.concatenate(partes[:-1]), TAXA)


@pytest.mark.parametrize("motor", voz_clinica.motores_disponiveis())
def test_mediana_faixa_e_pausas(motor):
    r = fala.analisar_fala(_frases(), motor=motor, tarefa="contagem")
    f = r["f0"]
    assert f["mediana_hz"] == pytest.approx(180, rel=0.03)
    assert f["nota_mediana"] in ("F#3", "G3")  # 180 Hz fica entre F#3 (185) e F3 (175)
    assert 6.5 < f["faixa_semitons"] < 8.5  # ±4 st, sem os 5% extremos
    assert 2 < f["dp_semitons"] < 3.5  # senoide de amplitude 4 st: dp ≈ 2,8
    assert r["fala"]["pausas"] == 4
    assert r["fala"]["tempo_vozeado_s"] == pytest.approx(6.0, abs=0.4)
    assert r["tarefa"] == "contagem" and r["motor"] == motor


def test_entonacao_monotona_tem_faixa_estreita():
    larga = fala.analisar_fala(_frases(semitons=4), motor="interno")["f0"]["faixa_semitons"]
    estreita = fala.analisar_fala(_frases(semitons=0.5), motor="interno")["f0"]["faixa_semitons"]
    assert estreita < 1.5 < larga


def test_sem_voz_e_entradas_invalidas():
    silencio = Audio(1e-3 * np.random.default_rng(1).standard_normal(3 * TAXA), TAXA)
    r = fala.analisar_fala(silencio, motor="interno")
    assert "f0" not in r and r["avisos"]
    with pytest.raises(ValueError):
        fala.analisar_fala(_frases(), motor="interno", tarefa="cantar")
    with pytest.raises(ValueError):
        fala.analisar_fala(_frases(), motor="interno", f0_min=300, f0_max=100)


def test_nota():
    assert fala.nota(440) == "A4" and fala.nota(220) == "A3" and fala.nota(261.6) == "C4"
