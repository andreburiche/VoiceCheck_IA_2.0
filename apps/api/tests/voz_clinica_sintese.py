"""Vozes sintéticas com valores conhecidos para testar os motores."""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

from app.services.voz_clinica.audio import Audio


@dataclass
class VozSintetica:
    audio: Audio
    periodos: np.ndarray  # s, realmente gerados
    amplitudes: np.ndarray

    @property
    def jitter_local_pct(self) -> float:
        p = self.periodos
        return 100 * np.mean(np.abs(np.diff(p))) / np.mean(p)

    @property
    def shimmer_local_pct(self) -> float:
        a = self.amplitudes
        return 100 * np.mean(np.abs(np.diff(a))) / np.mean(a)


def _ressonador(x, freq, banda, taxa):
    r = np.exp(-np.pi * banda / taxa)
    theta = 2 * np.pi * freq / taxa
    a = [1, -2 * r * np.cos(theta), r * r]
    return lfilter([1 - r], a, x)


def sintetizar(f0=150.0, dur=3.0, taxa=44100, sj=0.0, sa=0.0, ruido=0.0,
               formantes=None, seed=1) -> VozSintetica:
    """Trem de ciclos com período e amplitude sorteados (desvios relativos sj, sa).

    Sem formantes, cada ciclo é uma soma de harmônicos; com formantes, um trem
    de impulsos passa por ressonadores (vogal sintética).
    """
    rng = np.random.default_rng(seed)
    t0 = taxa / f0
    # pulso de forma fixa no início de cada ciclo: o pico fica sempre à mesma
    # distância do início, então pico a pico = período sorteado
    largura = int(0.4 * t0)
    pulso = np.hanning(largura) ** 2
    blocos, periodos, amps = [], [], []
    total = 0
    while total < dur * taxa:
        n = int(round(t0 * (1 + sj * rng.standard_normal())))
        a = 0.5 * (1 + sa * rng.standard_normal())
        ciclo = np.zeros(n)
        if formantes:
            ciclo[0] = a
        else:
            ciclo[:largura] = a * pulso
        blocos.append(ciclo)
        periodos.append(n / taxa)
        amps.append(a)
        total += n
    x = np.concatenate(blocos)
    if formantes:
        for freq, banda in formantes:
            x = _ressonador(x, freq, banda, taxa)
        x = 0.5 * x / np.max(np.abs(x))
    if ruido:
        x = x + ruido * rng.standard_normal(len(x))
    return VozSintetica(Audio(x, taxa), np.array(periodos), np.array(amps))


def para_wav(audio: Audio, bits=16) -> bytes:
    buf = io.BytesIO()
    if bits == 16:
        dados = np.clip(audio.amostras * 32767, -32768, 32767).astype(np.int16)
    else:
        dados = audio.amostras.astype(np.float32)
    wavfile.write(buf, audio.taxa, dados)
    return buf.getvalue()
