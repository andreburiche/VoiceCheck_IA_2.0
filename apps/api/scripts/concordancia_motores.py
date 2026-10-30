"""Concordância entre o motor Praat e o motor interno, com vozes sintéticas de valor conhecido.

Uso (onde o Parselmouth estiver instalado, como no Docker da API):
    python scripts/concordancia_motores.py [arquivo_saida.md]

Para cada voz (F0 grave e aguda × níveis crescentes de jitter, shimmer e ruído) mede F0,
jitter local, shimmer local, HNR e CPPS nos dois motores e compara com o valor sintetizado
(jitter e shimmer têm valor "verdadeiro"; HNR e CPPS só podem ser comparados entre os motores).
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(RAIZ), str(RAIZ / "tests")]

from app.services.voz_clinica import motor_interno, motor_praat  # noqa: E402
from voz_clinica_sintese import sintetizar  # noqa: E402

VOGAL = [(700, 80), (1200, 90), (2600, 120)]
NIVEIS = [  # (rótulo, desvio do período, desvio da amplitude, ruído)
    ("limpa", 0.0, 0.0, 0.002),
    ("leve", 0.005, 0.03, 0.005),
    ("moderada", 0.01, 0.06, 0.01),
    ("intensa", 0.02, 0.10, 0.03),
    ("severa", 0.03, 0.15, 0.08),
]
F0S = [110.0, 220.0]


def _v(r: dict, *chaves: str):
    for c in chaves:
        if r is None:
            return None
        r = r.get(c)
    return r


def medir() -> list[dict]:
    linhas = []
    for f0 in F0S:
        for rotulo, sj, sa, ruido in NIVEIS:
            voz = sintetizar(f0=f0, dur=3.0, sj=sj, sa=sa, ruido=ruido, formantes=VOGAL, seed=7)
            p = motor_praat.analisar(voz.audio)
            i = motor_interno.analisar(voz.audio)
            linhas.append({
                "voz": f"{int(f0)} Hz {rotulo}",
                "f0": (f0, _v(p, "f0", "media_hz"), _v(i, "f0", "media_hz")),
                "jitter": (voz.jitter_local_pct, _v(p, "perturbacao", "jitter_local_pct"), _v(i, "perturbacao", "jitter_local_pct")),
                "shimmer": (voz.shimmer_local_pct, _v(p, "perturbacao", "shimmer_local_pct"), _v(i, "perturbacao", "shimmer_local_pct")),
                "hnr": (None, _v(p, "ruido", "hnr_db"), _v(i, "ruido", "hnr_db")),
                "cpps": (None, _v(p, "cpps_db"), _v(i, "cpps_db")),
            })
    return linhas


def _fmt(x, casas=2):
    return "—" if x is None else f"{x:.{casas}f}".replace(".", ",")


def _spearman(a, b) -> float | None:
    pares = [(x, y) for x, y in zip(a, b) if x is not None and y is not None]
    if len(pares) < 3:
        return None
    ra = np.argsort(np.argsort([x for x, _ in pares]))
    rb = np.argsort(np.argsort([y for _, y in pares]))
    return float(np.corrcoef(ra, rb)[0, 1])


def resumo(linhas: list[dict]) -> dict:
    out = {}
    for m in ("f0", "jitter", "shimmer", "hnr", "cpps"):
        verd = [l[m][0] for l in linhas]
        pr = [l[m][1] for l in linhas]
        it = [l[m][2] for l in linhas]
        dif = [abs(a - b) for a, b in zip(pr, it) if a is not None and b is not None]
        out[m] = {
            "dif_media_praat_interno": float(np.mean(dif)) if dif else None,
            "ordem_praat_interno": _spearman(pr, it),
            "ordem_praat_verdade": _spearman(pr, verd) if verd[0] is not None else None,
            "ordem_interno_verdade": _spearman(it, verd) if verd[0] is not None else None,
        }
    return out


def relatorio(linhas: list[dict], r: dict) -> str:
    t = ["# Concordância entre os motores (Praat × interno)", "",
         "Vozes sintéticas (vogal com 3 formantes, 3 s). Valor sintetizado = o que foi gerado; Praat e interno = o que cada motor mediu.", "",
         "| Voz | F0 Praat / interno (Hz) | Jitter % sintet. / Praat / interno | Shimmer % sintet. / Praat / interno | HNR Praat / interno (dB) | CPPS Praat / interno (dB) |",
         "|---|---|---|---|---|---|"]
    for l in linhas:
        t.append(f"| {l['voz']} | {_fmt(l['f0'][1],1)} / {_fmt(l['f0'][2],1)} | "
                 f"{_fmt(l['jitter'][0])} / {_fmt(l['jitter'][1])} / {_fmt(l['jitter'][2])} | "
                 f"{_fmt(l['shimmer'][0])} / {_fmt(l['shimmer'][1])} / {_fmt(l['shimmer'][2])} | "
                 f"{_fmt(l['hnr'][1],1)} / {_fmt(l['hnr'][2],1)} | {_fmt(l['cpps'][1],1)} / {_fmt(l['cpps'][2],1)} |")
    t += ["", "| Medida | Diferença média Praat × interno | Ordem igual Praat × interno (Spearman) | Praat × sintetizado | Interno × sintetizado |", "|---|---|---|---|---|"]
    for m, v in r.items():
        t.append(f"| {m} | {_fmt(v['dif_media_praat_interno'])} | {_fmt(v['ordem_praat_interno'])} | {_fmt(v['ordem_praat_verdade'])} | {_fmt(v['ordem_interno_verdade'])} |")
    return "\n".join(t) + "\n"


if __name__ == "__main__":
    linhas = medir()
    texto = relatorio(linhas, resumo(linhas))
    print(texto)
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(texto, encoding="utf-8")
