"""Pontos por trecho para o Diagrama de Desvio Fonatório (a "nuvem" de pontos do VoxMetria).

O VoxMetria desenha, além do ponto da gravação inteira, um ponto para cada trecho curto da
vogal: a nuvem mostra se a voz é estável (pontos juntos) ou instável (pontos espalhados).
Aqui a vogal é dividida em trechos de 0,5 s dentro da voz; em cada trecho medem-se jitter
e shimmer (pelo MESMO motor da análise principal — os dois motores nunca se misturam) e o
GNE (mesma função para os dois motores).
"""

from __future__ import annotations

from typing import Callable

import numpy as np

from . import excitacao

TRECHO_S = 0.5
MINIMO_S = 0.3
MAX_TRECHOS = 40

# (início_s, fim_s) -> (jitter_local_pct, shimmer_local_pct) ou None
Perturbacao = Callable[[float, float], "tuple[float | None, float | None] | None"]


def janelas(trechos_vozeados: list[tuple[float, float]], duracao: float) -> list[tuple[float, float]]:
    """Trechos de 0,5 s seguidos dentro de cada trecho com voz (sobra ≥ 0,3 s vira um trecho)."""
    saida: list[tuple[float, float]] = []
    for ini, fim in excitacao._juntar(trechos_vozeados):
        ini, fim = max(0.0, ini), min(duracao, fim)
        t = ini
        while fim - t >= MINIMO_S and len(saida) < MAX_TRECHOS:
            b = min(t + TRECHO_S, fim)
            if fim - b < MINIMO_S:  # sobra curta demais: junta ao último trecho
                b = fim
            saida.append((round(t, 3), round(b, 3)))
            t = b
    return saida


def medir(amostras: np.ndarray, taxa: int, trechos_vozeados, perturbacao: Perturbacao) -> list[dict]:
    """Lista de pontos {inicio_s, fim_s, jitter_pct, shimmer_pct, gne}; trecho sem medida é pulado."""
    duracao = len(amostras) / taxa
    pontos = []
    for a, b in janelas(trechos_vozeados, duracao):
        try:
            p = perturbacao(a, b)
        except Exception:  # um trecho ruim não derruba os outros
            p = None
        if not p or p[0] is None or p[1] is None:
            continue
        trecho = amostras[int(a * taxa) : int(b * taxa)]
        try:
            g = excitacao.gne(trecho, taxa, [(0.0, b - a)]).get("gne")
        except Exception:
            g = None
        if g is None:
            continue
        pontos.append({
            "inicio_s": a,
            "fim_s": b,
            "jitter_pct": round(float(p[0]), 3),
            "shimmer_pct": round(float(p[1]), 3),
            "gne": round(float(g), 3),
        })
    return pontos


def perturbacao_interna(ciclos, perturbacao_fn) -> Perturbacao:
    """Jitter e shimmer do motor interno só com os ciclos que caem dentro do trecho."""

    def medir_trecho(a: float, b: float):
        sub = []
        for instantes, amps in ciclos:
            instantes = np.asarray(instantes)
            amps = np.asarray(amps)
            idx = np.nonzero((instantes >= a) & (instantes <= b))[0]
            if len(idx) >= 3 and len(amps):
                # amps[k] é o ciclo entre as marcas k e k+1 (uma a menos que as marcas)
                sub.append((instantes[idx], amps[np.minimum(idx, len(amps) - 1)]))
        if not sub:
            return None
        r = perturbacao_fn(sub)
        if not r:
            return None
        return r.get("jitter_local_pct"), r.get("shimmer_local_pct")

    return medir_trecho
