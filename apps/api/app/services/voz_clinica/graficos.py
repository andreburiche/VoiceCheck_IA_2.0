"""Dados dos gráficos da análise acústica (como as telas do VoxMetria e o LTAS do lingWAVES).

Tudo é reduzido para caber no resultado salvo (JSON de poucas dezenas de kB):

- onda: mínimo e máximo do sinal em ~600 colunas, com a marca de voz (sonorizado) por coluna;
- contorno: F0 (Hz, null sem voz) e intensidade (dBFS) a cada 20 ms;
- espectro: espectro médio de longo termo (LTAS) dos trechos com voz, por FFT (Welch, janelas
  de 46 ms), e o envelope LPC sobre ele (formantes), de 0 a 5 kHz, normalizados para 0 dB no pico.
"""

from __future__ import annotations

import numpy as np
from scipy.signal import freqz, resample_poly, welch

from .audio import Audio

COLUNAS_ONDA = 600
PASSO_CONTORNO_S = 0.02
FMAX_ESPECTRO = 5000.0
PONTOS_ESPECTRO = 250


def _onda(audio: Audio, tempos: np.ndarray, vozeado: np.ndarray) -> dict:
    x = audio.amostras
    n = min(COLUNAS_ONDA, len(x))
    bordas = np.linspace(0, len(x), n + 1).astype(int)
    mins = [float(x[a:b].min()) if b > a else 0.0 for a, b in zip(bordas[:-1], bordas[1:])]
    maxs = [float(x[a:b].max()) if b > a else 0.0 for a, b in zip(bordas[:-1], bordas[1:])]
    centro = (bordas[:-1] + bordas[1:]) / 2 / audio.taxa
    idx = np.clip(np.searchsorted(tempos, centro), 0, len(tempos) - 1) if len(tempos) else np.zeros(n, int)
    voz = vozeado[idx] & (np.abs(tempos[idx] - centro) <= 0.03) if len(tempos) else np.zeros(n, bool)
    return {
        "duracao_s": round(audio.duracao, 3),
        "min": [round(v, 3) for v in mins],
        "max": [round(v, 3) for v in maxs],
        "voz": [bool(v) for v in voz],
    }


def _contorno(audio: Audio, tempos: np.ndarray, f0s: np.ndarray) -> dict:
    passo = PASSO_CONTORNO_S
    t = np.arange(passo / 2, audio.duracao, passo)
    janela = int(0.04 * audio.taxa)
    db = []
    for ti in t:
        ini = max(0, int(ti * audio.taxa) - janela // 2)
        q = audio.amostras[ini : ini + janela]
        db.append(round(float(10 * np.log10(np.mean(q**2) + 1e-12)), 1))
    f0 = []
    for ti in t:
        if len(tempos) == 0:
            f0.append(None)
            continue
        i = int(np.argmin(np.abs(tempos - ti)))
        v = f0s[i]
        f0.append(None if np.isnan(v) or abs(tempos[i] - ti) > passo else round(float(v), 1))
    return {"passo_s": passo, "f0_hz": f0, "db": db}


def _espectro(audio: Audio, tempos: np.ndarray, vozeado: np.ndarray) -> dict | None:
    # só os trechos com voz entram no LTAS (silêncio e ruído de fundo puxariam o espectro)
    if not vozeado.any():
        return None
    meio = int(0.005 * audio.taxa)
    marcas = np.zeros(len(audio.amostras), bool)
    for t in tempos[vozeado]:
        c = int(t * audio.taxa)
        marcas[max(0, c - meio) : c + meio] = True
    x = audio.amostras[marcas]
    if len(x) < int(0.1 * audio.taxa):
        return None
    nperseg = int(2 ** np.round(np.log2(0.046 * audio.taxa)))
    f, p = welch(x, fs=audio.taxa, nperseg=nperseg, noverlap=nperseg // 2, window="hann")
    # LPC a 11 kHz: ordem 2 + taxa/1000 (regra usual), formantes até ~5 kHz
    taxa_lpc = 11025
    y = resample_poly(x, taxa_lpc, audio.taxa) if audio.taxa != taxa_lpc else x
    y = np.append(y[0], y[1:] - 0.97 * y[:-1])  # pré-ênfase
    trechos = [y[i : i + 1024] * np.hanning(1024) for i in range(0, max(1, len(y) - 1024), 512)]
    if not trechos:
        return None
    ordem = 2 + taxa_lpc // 1000
    r_med = np.mean([np.correlate(s, s, mode="full")[len(s) - 1 : len(s) + ordem] for s in trechos if len(s) == 1024], axis=0)
    # Levinson sobre a autocorrelação média (equivale a LPC do conjunto)
    a = np.zeros(ordem + 1)
    a[0] = 1.0
    erro = float(r_med[0])
    for i in range(1, ordem + 1):
        k = -(r_med[i] + np.dot(a[1:i], r_med[i - 1 : 0 : -1])) / erro
        a[1 : i + 1] = a[1 : i + 1] + k * np.concatenate((a[i - 1 : 0 : -1], [1.0]))
        erro *= 1 - k * k
    eixo = np.linspace(0, FMAX_ESPECTRO, PONTOS_ESPECTRO)
    _, h = freqz([1.0], a, worN=eixo, fs=taxa_lpc)
    lpc_db = 20 * np.log10(np.abs(h) + 1e-12)
    fft_db = 10 * np.log10(np.interp(eixo, f, p) + 1e-20)
    fft_db -= fft_db.max()
    lpc_db -= lpc_db.max()
    # picos do envelope LPC = formantes estimados
    picos = [float(eixo[i]) for i in range(1, len(eixo) - 1) if lpc_db[i] > lpc_db[i - 1] and lpc_db[i] >= lpc_db[i + 1] and eixo[i] > 150]
    return {
        "freq_hz": [round(float(v)) for v in eixo],
        "fft_db": [round(float(max(v, -80)), 1) for v in fft_db],
        "lpc_db": [round(float(max(v, -80)), 1) for v in lpc_db],
        "picos_lpc_hz": [round(v) for v in picos[:5]],
    }


def montar(audio: Audio, tempos: np.ndarray, f0s: np.ndarray) -> dict:
    tempos = np.asarray(tempos, float)
    f0s = np.asarray(f0s, float)
    vozeado = ~np.isnan(f0s)
    saida = {"onda": _onda(audio, tempos, vozeado), "contorno": _contorno(audio, tempos, f0s)}
    espectro = _espectro(audio, tempos, vozeado)
    if espectro:
        saida["espectro"] = espectro
    return saida
