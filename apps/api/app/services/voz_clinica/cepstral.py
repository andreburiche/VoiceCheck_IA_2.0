"""Análise cepstral da vogal e da frase (como no VoxMetria 5) e AVQI.

Duas gravações: a vogal sustentada (o VoxMetria usa /ɛ/, "é") e a frase "Olha lá o avião
azul". Para cada uma:

- CPP: proeminência do pico cepstral, média dos quadros sem suavização;
- CPPS: a mesma medida suavizada no tempo (10 ms) e na quefrência (1 ms), como no Praat e
  em Hillenbrand & Houde (1996). Na fala encadeada o CPPS inclui trechos sem voz, por isso
  fica menor que na vogal: compare sempre vogal com vogal e frase com frase.

AVQI (Acoustic Voice Quality Index, versão 03.01; Maryn et al. 2010, Barsties & Maryn 2015):
combina vogal (3 s centrais) e os trechos sonoros da frase, concatenados:

    AVQI = (4,152 − 0,177·CPPS − 0,006·HNR − 0,037·Shimmer% + 0,941·Shimmer dB
            + 0,01·Slope + 0,093·Tilt) × 2,8902

Calculado só com o motor Praat, com os comandos do roteiro publicado (CPPS como no Praat,
LTAS com slope 0–1 kHz × 1–10 kHz e tilt pela reta de tendência). Escala de 0 a 10: quanto
maior, mais desviada a voz. O ponto de corte depende da língua e da versão; não mostramos
corte. Este não é o DAI do VoxMetria (fórmula não publicada).
"""

from __future__ import annotations

import numpy as np

from . import motor_interno, motor_praat
from .audio import Audio

VOGAL_AVQI_S = 3.0


def _medidas_interno(audio: Audio) -> dict:
    return {
        "duracao_s": round(audio.duracao, 3),
        "cpp_db": motor_interno.cpps(audio, suavizar=False),
        "cpps_db": motor_interno.cpps(audio, suavizar=True),
    }


def _cepstro_praat(snd, suavizar: bool) -> float | None:
    call = motor_praat.call
    cg = call(snd, "To PowerCepstrogram", 60, 0.002, 5000, 50)
    # sem suavização: janelas mínimas (1 quadro no tempo, 1 ponto na quefrência)
    tempo, quef = (0.01, 0.001) if suavizar else (0.002, 0.0001)
    try:
        v = call(cg, "Get CPPS", False, tempo, quef, 60, 330, 0.05, "parabolic", 0.001, 0.0, "Straight", "Robust")
    except Exception:  # noqa: BLE001 — nomes de opção mudaram em versões novas do Praat
        v = call(cg, "Get CPPS", False, tempo, quef, 60, 330, 0.05, "parabolic", 0.001, 0.05, "Straight", "Robust slow")
    v = float(v)
    return None if np.isnan(v) else round(v, 2)


def _medidas_praat(audio: Audio) -> dict:
    snd = motor_praat.parselmouth.Sound(audio.amostras, sampling_frequency=audio.taxa)
    return {"duracao_s": round(audio.duracao, 3), "cpp_db": _cepstro_praat(snd, False), "cpps_db": _cepstro_praat(snd, True)}


def _trechos_sonoros(snd):
    """Só as partes com som da frase (pausas fora), como no roteiro do AVQI."""
    call = motor_praat.call
    tg = call(snd, "To TextGrid (silences)", 50, 0.003, -25, 0.1, 0.1, "silencio", "som")
    partes = []
    for i in range(1, int(call(tg, "Get number of intervals", 1)) + 1):
        if call(tg, "Get label of interval", 1, i) == "som":
            ini = call(tg, "Get starting point", 1, i)
            fim = call(tg, "Get end point", 1, i)
            partes.append(call(snd, "Extract part", ini, fim, "rectangular", 1, False))
    return partes


def avqi(vogal: Audio, frase: Audio) -> dict:
    parselmouth, call = motor_praat.parselmouth, motor_praat.call
    v = parselmouth.Sound(vogal.amostras, sampling_frequency=vogal.taxa)
    if vogal.duracao > VOGAL_AVQI_S:  # 3 s centrais da vogal
        meio = vogal.duracao / 2
        v = call(v, "Extract part", meio - VOGAL_AVQI_S / 2, meio + VOGAL_AVQI_S / 2, "rectangular", 1, False)
    f = parselmouth.Sound(frase.amostras, sampling_frequency=frase.taxa)
    if frase.taxa != vogal.taxa:
        f = call(f, "Resample", vogal.taxa, 50)
    partes = _trechos_sonoros(f) or [f]
    junto = parselmouth.Sound.concatenate(partes + [v])

    cpps = _cepstro_praat(junto, True)
    ltas = call(junto, "To Ltas", 1)
    slope = call(ltas, "Get slope", 0, 1000, 1000, 10000, "energy")
    tendencia = call(ltas, "Compute trend line", 1, 10000)
    tilt = call(tendencia, "Get slope", 0, 1000, 1000, 10000, "energy")
    pp = call(junto, "To PointProcess (periodic, cc)", 50, 400)
    shim = 100 * call([junto, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    shdb = call([junto, pp], "Get shimmer (local_dB)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
    hnr = call(call(junto, "To Harmonicity (cc)", 0.01, 75, 0.1, 1.0), "Get mean", 0, 0)
    comp = {"cpps_db": cpps, "hnr_db": float(hnr), "shimmer_pct": float(shim), "shimmer_db": float(shdb),
            "slope_db": float(slope), "tilt_db": float(tilt)}
    if any(x is None or np.isnan(x) for x in comp.values()):
        raise ValueError("medida do AVQI indefinida")
    valor = (4.152 - 0.177 * comp["cpps_db"] - 0.006 * comp["hnr_db"] - 0.037 * comp["shimmer_pct"]
             + 0.941 * comp["shimmer_db"] + 0.01 * comp["slope_db"] + 0.093 * comp["tilt_db"]) * 2.8902
    return {
        "valor": round(float(valor), 2),
        "versao": "03.01",
        "componentes": {k: round(x, 3) for k, x in comp.items()},
        "duracao_analisada_s": round(junto.get_total_duration(), 2),
    }


def analisar_cepstral(vogal: Audio, frase: Audio, motor: str = "auto") -> dict:
    if motor == "auto":
        motor = "praat" if motor_praat.DISPONIVEL else "interno"
    if motor == "praat" and not motor_praat.DISPONIVEL:
        raise ValueError("Motor praat indisponível: instale com 'pip install praat-parselmouth'.")
    if motor not in ("praat", "interno"):
        raise ValueError("Motor desconhecido: use auto, praat ou interno.")
    medir = _medidas_praat if motor == "praat" else _medidas_interno
    saida: dict = {"motor": motor, "vogal": medir(vogal), "frase": medir(frase), "avisos": []}
    if vogal.duracao < 2:
        saida["avisos"].append("Vogal curta: grave de 3 a 5 s de /ɛ/ (\"é\") sustentado.")
    if frase.duracao > 8:
        saida["avisos"].append("A frase passou de 8 s: grave só \"Olha lá o avião azul\", em voz habitual.")
    if motor == "praat":
        try:
            saida["avqi"] = avqi(vogal, frase)
        except Exception as erro:  # noqa: BLE001
            saida["avisos"].append(f"AVQI: não calculado ({erro.__class__.__name__}).")
    else:
        saida["avisos"].append("AVQI só é calculado com o motor Praat.")
    return saida
