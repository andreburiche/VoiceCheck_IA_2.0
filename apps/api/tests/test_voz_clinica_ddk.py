"""Diadococinesia com sílabas sintéticas de ritmo conhecido."""

import numpy as np
import pytest

from app.services.voz_clinica import ddk
from app.services.voz_clinica.audio import Audio

TAXA = 44100


def silabas(taxa_s=6.0, n=36, desvio=0.0, ganhos=None, pausa_em=None, seed=0) -> tuple[Audio, np.ndarray]:
    """Consoante (ruído, 25 ms) + vogal (harmônicos, 90 ms) a cada 1/taxa_s s, com desvio relativo nos intervalos."""
    rng = np.random.default_rng(seed)
    intervalos = (1 / taxa_s) * (1 + desvio * rng.standard_normal(n - 1))
    if pausa_em is not None:
        intervalos[pausa_em] += 0.8
    inicios = 0.3 + np.concatenate(([0.0], np.cumsum(intervalos)))
    x = 1e-4 * rng.standard_normal(int((inicios[-1] + 0.5) * TAXA))
    tv = np.arange(int(0.09 * TAXA)) / TAXA
    vogal = sum(np.sin(2 * np.pi * 150 * h * tv) / h for h in range(1, 6)) * np.sin(np.pi * tv / 0.09)
    for i, ini in enumerate(inicios):
        a = int(ini * TAXA)
        g = 0.3 * (ganhos[i] if ganhos is not None else 1.0)
        x[a : a + int(0.025 * TAXA)] += 0.05 * g * rng.standard_normal(int(0.025 * TAXA))
        b = a + int(0.025 * TAXA)
        x[b : b + len(vogal)] += g * vogal
    return Audio(x, TAXA), inicios


@pytest.mark.parametrize("taxa_s", [4.0, 6.0, 8.0])
def test_conta_silabas_e_taxa(taxa_s):
    audio, inicios = silabas(taxa_s=taxa_s)
    r = ddk.analisar_ddk(audio, "pa")
    assert r["silabas"] == 36
    assert r["taxa_silabas_s"] == pytest.approx(taxa_s, rel=0.03)
    assert r["intervalo_cv_pct"] < 3
    assert len(r["picos_s"]) == 36 and max(r["picos_db"]) == 0


def test_ritmo_irregular_aumenta_o_cv():
    regular = ddk.analisar_ddk(silabas(desvio=0.0)[0], "ta")["intervalo_cv_pct"]
    irregular = ddk.analisar_ddk(silabas(desvio=0.15)[0], "ta")["intervalo_cv_pct"]
    assert irregular > 10 > regular


def test_intensidade_instavel_e_pausa():
    ganhos = np.where(np.arange(36) % 2 == 0, 1.0, 0.5)  # alterna 0 e -6 dB
    r = ddk.analisar_ddk(silabas(ganhos=ganhos)[0], "ka")
    assert r["intensidade_dp_db"] == pytest.approx(3.0, abs=0.6)
    p = ddk.analisar_ddk(silabas(pausa_em=10)[0], "pataka")
    assert any("pausa longa" in a for a in p["avisos"])


def test_fadiga_aparece_na_segunda_metade():
    rng_int = np.concatenate((np.full(17, 1 / 7), np.full(18, 1 / 5)))
    # recria com intervalos que desaceleram
    x = np.zeros(int((0.3 + rng_int.sum() + 0.5) * TAXA))
    base, _ = silabas(n=2)
    pedaco = base.amostras[int(0.3 * TAXA) : int(0.3 * TAXA) + int(0.12 * TAXA)]
    for ini in 0.3 + np.concatenate(([0.0], np.cumsum(rng_int))):
        a = int(ini * TAXA)
        x[a : a + len(pedaco)] += pedaco
    r = ddk.analisar_ddk(Audio(x + 1e-4 * np.random.default_rng(2).standard_normal(len(x)), TAXA), "pa")
    assert r["taxa_inicio_silabas_s"] == pytest.approx(7, rel=0.05)
    assert r["taxa_fim_silabas_s"] == pytest.approx(5, rel=0.05)


def test_sem_silabas_e_tarefa_invalida():
    silencio = Audio(1e-3 * np.random.default_rng(1).standard_normal(3 * TAXA), TAXA)
    assert "silabas" not in ddk.analisar_ddk(silencio, "pa")
    with pytest.raises(ValueError):
        ddk.analisar_ddk(silencio, "la")
