"""Diadococinesia oral (DDK): repetição rápida de sílabas, como no MSDA do lingWAVES.

Tarefas: /pa/, /ta/, /ka/ repetidos (AMR, ritmo alternado) e /pataka/ (SMR, sequencial).
Cada sílaba vira um pico no envelope de intensidade (a vogal é a parte mais forte); medimos:

- número de sílabas e taxa (sílabas por segundo, do primeiro ao último pico);
- regularidade do ritmo: desvio-padrão e coeficiente de variação (CV) dos intervalos;
- estabilidade da intensidade: desvio-padrão do nível dos picos (dB);
- ritmo no começo e no fim (1ª e 2ª metade): queda grande sugere fadiga ou perda de ritmo.

Envelope: RMS em janelas de 20 ms a cada 5 ms, em dB, suavizado; picos com proeminência de
pelo menos 6 dB, distantes 70 ms ou mais (teto de ~14 sílabas/s) e a no máximo 30 dB do
pico mais forte (ruído de fundo não conta).
"""

from __future__ import annotations

import numpy as np
from scipy.signal import find_peaks

from .audio import Audio

PASSO_S = 0.005
JANELA_S = 0.020
PROEMINENCIA_DB = 6.0
DISTANCIA_MIN_S = 0.07
FAIXA_DB = 30.0
TAREFAS = ("pa", "ta", "ka", "pataka")


def _envelope_db(audio: Audio) -> tuple[np.ndarray, np.ndarray]:
    passo = max(1, int(PASSO_S * audio.taxa))
    janela = max(passo, int(JANELA_S * audio.taxa))
    x = audio.amostras - np.mean(audio.amostras)
    n = 1 + max(0, (len(x) - janela) // passo)
    quadrado = np.concatenate(([0.0], np.cumsum(x * x)))
    inicios = np.arange(n) * passo
    energia = (quadrado[inicios + janela] - quadrado[inicios]) / janela
    db = 10 * np.log10(energia + 1e-12)
    # suavização de 25 ms: junta a consoante e a vogal da mesma sílaba
    k = 5
    db = np.convolve(np.pad(db, (k // 2, k // 2), mode="edge"), np.ones(k) / k, mode="valid")
    tempos = (inicios + janela / 2) / audio.taxa
    return tempos, db


def _taxa(tempos: np.ndarray) -> float | None:
    return float((len(tempos) - 1) / (tempos[-1] - tempos[0])) if len(tempos) >= 3 and tempos[-1] > tempos[0] else None


def analisar_ddk(audio: Audio, tarefa: str = "pa") -> dict:
    if tarefa not in TAREFAS:
        raise ValueError(f"Tarefa desconhecida: use {', '.join(TAREFAS)}.")
    tempos, db = _envelope_db(audio)
    base = {"tarefa": tarefa, "duracao_s": round(audio.duracao, 3)}
    picos, _ = find_peaks(
        db,
        prominence=PROEMINENCIA_DB,
        distance=max(1, int(DISTANCIA_MIN_S / PASSO_S)),
        height=float(np.max(db)) - FAIXA_DB,
    )
    if len(picos) < 5:
        return {**base, "avisos": ["Menos de 5 sílabas encontradas. Peça a repetição rápida por 5 a 10 segundos, sem parar."]}

    t = tempos[picos]
    niveis = db[picos]
    intervalos = np.diff(t)
    meio = len(t) // 2
    avisos = []
    if np.max(intervalos) > 0.6:
        avisos.append("Houve pausa longa (mais de 0,6 s) no meio da repetição: a taxa inclui a pausa.")
    if np.max(np.abs(audio.amostras)) >= 0.999:
        avisos.append("A gravação saturou (clipping); afaste o microfone e grave de novo.")

    taxa_ini, taxa_fim = _taxa(t[: meio + 1]), _taxa(t[meio:])
    return {
        **base,
        "silabas": int(len(t)),
        "tempo_repeticao_s": round(float(t[-1] - t[0]), 3),
        "taxa_silabas_s": round(float(_taxa(t) or 0.0), 2),
        "intervalo_medio_ms": round(float(1000 * np.mean(intervalos)), 1),
        "intervalo_dp_ms": round(float(1000 * np.std(intervalos)), 1),
        "intervalo_cv_pct": round(float(100 * np.std(intervalos) / np.mean(intervalos)), 1),
        "intensidade_dp_db": round(float(np.std(niveis)), 2),
        "taxa_inicio_silabas_s": None if taxa_ini is None else round(taxa_ini, 2),
        "taxa_fim_silabas_s": None if taxa_fim is None else round(taxa_fim, 2),
        # para o gráfico de ritmo (no máximo 200 sílabas; a gravação vai até 30 s)
        "picos_s": [round(float(v), 3) for v in t[:200]],
        "picos_db": [round(float(v - np.max(niveis)), 1) for v in niveis[:200]],
        "avisos": avisos,
    }
