"""Medidas da excitação glótica usadas no Diagrama de Rouquidão de Göttingen (GHD).

GNE — Glottal-to-Noise Excitation ratio (Michaelis, Gramss & Strube, 1997).
    Mede se os pulsos da glote excitam as várias faixas de frequência ao mesmo tempo
    (voz periódica: envelopes sincronizados, GNE perto de 1) ou se a excitação é ruído
    (envelopes independentes, GNE baixo). Passos, como no artigo original:
      1. reamostrar para 10 kHz;
      2. filtro inverso LPC de ordem 13, estimado em quadros de 30 ms com janela de Hann
         (passo de 10 ms) e aplicado ao sinal CONTÍNUO, sem janela na saída;
      3. envelope de Hilbert em bandas de 1 kHz (janela de Hann na frequência), centros a
         cada 300 Hz — valores recomendados por Godino-Llorente et al. (2010);
      4. correlação normalizada entre envelopes (média removida) de bandas que se
         sobrepõem no máximo pela metade, com defasagem de até ±0,3 ms, em janelas de
         100 ms (passo de 50 ms) dentro de cada trecho com voz;
      5. GNE da janela = maior correlação; GNE da gravação = mediana das janelas.
    Por que o sinal contínuo e janelas de 100 ms: aplicar a janela de Hann a cada quadro de
    30 ms impõe a MESMA forma de envelope a todas as bandas, e até ruído puro parecia
    sincronizado (GNE ≈ 0,86 em ruído branco nos nossos testes). Do jeito acima, ruído
    branco dá ≈ 0,3 e a voz sintética cai de 1,0 de forma proporcional ao ruído somado.
    Os valores absolutos podem diferir dos de outros programas (lingWAVES etc.): compare
    sessões do mesmo paciente medidas aqui.
    Referência de implementação aberta: SpeechBrain, speechbrain/processing/vocal_features.py
    (Apache-2.0). Diferença: aqui a média de cada envelope é removida antes da correlação,
    como descrito para o GHD (Kurz, Parlitz & Kaatze, "Oscillations, Waves and Interactions",
    Universitätsverlag Göttingen, 2007, seção 3.3).

MWC — Mean Waveform matching Coefficient: média da correlação entre a forma de onda de
    cada ciclo glótico e a do ciclo seguinte (mesmo texto). 1 = ciclos idênticos.

Estas medidas NÃO são os eixos do GHD: o diagrama combina jitter, shimmer, MWC e GNE com
pesos e escalas definidos por Michaelis (1999), que não estão implementados aqui.
"""

from __future__ import annotations

import numpy as np
from scipy.signal import lfilter, resample_poly

TAXA_GNE = 10_000
QUADRO_S = 0.030
PASSO_S = 0.010
ORDEM_LPC = 13
BANDA_HZ = 1000
DESLOCAMENTO_HZ = 300
DEFASAGEM = 3  # amostras a 10 kHz = ±0,3 ms
JANELA_CORR = 1000  # 100 ms a 10 kHz
PASSO_CORR = 500
BORDA = 300  # descarta 30 ms em cada ponta do trecho (transitório do filtro e da voz)


def _lpc(x: np.ndarray, ordem: int) -> np.ndarray:
    """Coeficientes [1, a1..ap] pelo método da autocorrelação (Levinson-Durbin)."""
    r = np.correlate(x, x, mode="full")[len(x) - 1 : len(x) + ordem]
    a = np.zeros(ordem + 1)
    a[0] = 1.0
    erro = r[0]
    if erro <= 0:
        return a
    for i in range(1, ordem + 1):
        acc = r[i] + np.dot(a[1:i], r[i - 1 : 0 : -1])
        k = -acc / erro
        a[1 : i + 1] = a[1 : i + 1] + k * np.concatenate((a[i - 1 : 0 : -1], [1.0]))
        erro *= 1 - k * k
        if erro <= 0:
            break
    return a


def _bandas() -> list[float]:
    meio = BANDA_HZ / 2
    return [float(c) for c in np.arange(meio, TAXA_GNE / 2 - meio, DESLOCAMENTO_HZ)]


def _envelopes(excitacao: np.ndarray, centros: list[float]) -> np.ndarray:
    """Envelopes de Hilbert (bandas × amostras), já sem a média."""
    n = len(excitacao)
    espectro = np.fft.fft(excitacao)
    freqs = np.fft.fftfreq(n, 1 / TAXA_GNE)
    saida = np.empty((len(centros), n))
    for i, c in enumerate(centros):
        faixa = (freqs > c - BANDA_HZ / 2) & (freqs < c + BANDA_HZ / 2)  # só frequências positivas
        mascara = np.zeros(n)
        mascara[faixa] = np.hanning(int(faixa.sum()) + 2)[1:-1]
        env = np.abs(np.fft.ifft(espectro * mascara))
        saida[i] = env - env.mean()
    return saida


def _maior_correlacao(envs: np.ndarray, centros: list[float]) -> float | None:
    normas = np.linalg.norm(envs, axis=1)
    melhor = None
    n = envs.shape[1]
    for i in range(len(centros)):
        for j in range(i + 1, len(centros)):
            if centros[j] - centros[i] <= BANDA_HZ / 2:  # bandas que se sobrepõem mais que a metade
                continue
            den = normas[i] * normas[j]
            if den < 1e-12:
                continue
            a, b = envs[i], envs[j]
            for d in range(-DEFASAGEM, DEFASAGEM + 1):
                c = np.dot(a[max(0, d) : n + min(0, d)], b[max(0, -d) : n - max(0, d)]) / den
                if melhor is None or c > melhor:
                    melhor = float(c)
    return melhor


def _excitacao(x: np.ndarray) -> np.ndarray:
    """Filtro inverso LPC variável no tempo: coeficientes do quadro de 30 ms centrado em cada
    bloco de 10 ms, aplicados ao sinal sem janela (a saída é contínua)."""
    tam = int(QUADRO_S * TAXA_GNE)
    passo = int(PASSO_S * TAXA_GNE)
    janela = np.hanning(tam)
    y = np.zeros_like(x)
    for i in range(0, len(x) - tam + 1, passo):
        a = _lpc(x[i : i + tam] * janela, ORDEM_LPC)
        ini = i + (tam - passo) // 2  # bloco central do quadro
        bloco = x[max(0, ini - ORDEM_LPC) : ini + passo]
        filtrado = lfilter(a, [1.0], bloco)
        y[ini : ini + passo] = filtrado[len(bloco) - passo :]
    return y


def _juntar(trechos: list[tuple[float, float]], pausa_max: float = 0.1) -> list[tuple[float, float]]:
    """Voz com muito ruído quebra o rastreio de pitch em pedaços: para o GNE, pausas
    curtas não separam a emissão (é justamente nessas vozes que o GNE importa)."""
    saida: list[list[float]] = []
    for a, b in sorted(trechos):
        if saida and a - saida[-1][1] <= pausa_max:
            saida[-1][1] = max(saida[-1][1], b)
        else:
            saida.append([a, b])
    return [(a, b) for a, b in saida]


def gne(amostras: np.ndarray, taxa: int, trechos_vozeados: list[tuple[float, float]]) -> dict:
    """GNE da gravação: mediana das janelas de 100 ms dentro dos trechos com voz."""
    if not trechos_vozeados:
        return {}
    x = resample_poly(amostras.astype(float), TAXA_GNE, taxa) if taxa != TAXA_GNE else amostras.astype(float)
    centros = _bandas()
    valores = []
    for ini_s, fim_s in _juntar(trechos_vozeados):
        a, b = int(ini_s * TAXA_GNE), int(fim_s * TAXA_GNE)
        trecho = x[max(0, a) : min(len(x), b)]
        if len(trecho) < JANELA_CORR + 2 * BORDA + int(QUADRO_S * TAXA_GNE):
            continue
        exc = _excitacao(trecho)[BORDA:-BORDA]
        envs = _envelopes(exc, centros)
        for i in range(0, envs.shape[1] - JANELA_CORR + 1, PASSO_CORR):
            janela = envs[:, i : i + JANELA_CORR]
            v = _maior_correlacao(janela - janela.mean(axis=1, keepdims=True), centros)
            if v is not None:
                valores.append(v)
    if not valores:
        return {}
    return {"gne": round(float(np.median(valores)), 3), "gne_janelas": len(valores)}


def mwc(amostras: np.ndarray, taxa: int, ciclos) -> float | None:
    """Correlação média entre ciclos glóticos vizinhos (forma de onda).

    `ciclos`: trechos de marcas de ciclo [(instantes_s, amplitudes), ...] do motor interno.
    Cada ciclo é reamostrado para o tamanho médio do par antes de comparar.
    """
    coefs = []
    for instantes, _ in ciclos:
        marcas = np.round(np.asarray(instantes) * taxa).astype(int)
        for k in range(len(marcas) - 2):
            a = amostras[marcas[k] : marcas[k + 1]]
            b = amostras[marcas[k + 1] : marcas[k + 2]]
            if len(a) < 8 or len(b) < 8:
                continue
            n = (len(a) + len(b)) // 2
            ra = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a)
            rb = np.interp(np.linspace(0, len(b) - 1, n), np.arange(len(b)), b)
            ra, rb = ra - ra.mean(), rb - rb.mean()
            den = np.linalg.norm(ra) * np.linalg.norm(rb)
            if den > 1e-12:
                coefs.append(float(np.dot(ra, rb) / den))
    return round(float(np.mean(coefs)), 4) if len(coefs) >= 3 else None


def medir(amostras: np.ndarray, taxa: int, trechos_vozeados, ciclos) -> dict:
    """Bloco "excitacao" do resultado da análise."""
    saida = gne(amostras, taxa, trechos_vozeados)
    m = mwc(amostras, taxa, ciclos)
    if m is not None:
        saida["mwc"] = m
    return saida
