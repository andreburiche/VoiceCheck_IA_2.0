"""Leitura de áudio WAV e utilidades comuns aos motores."""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly


class ErroAudio(ValueError):
    """Áudio inválido ou impossível de analisar."""


@dataclass
class Audio:
    amostras: np.ndarray  # mono, float64, faixa aproximada -1..1
    taxa: int  # Hz

    @property
    def duracao(self) -> float:
        return len(self.amostras) / self.taxa


def ler_wav(dados: bytes) -> Audio:
    """Lê um WAV (PCM 8/16/24/32 bits ou float) e devolve mono em float."""
    try:
        taxa, sinal = wavfile.read(io.BytesIO(dados))
    except Exception as exc:  # scipy lança vários tipos
        raise ErroAudio(
            "Não foi possível ler o arquivo. Envie um WAV sem compressão (PCM)."
        ) from exc

    sinal = np.asarray(sinal)
    if sinal.ndim == 2:
        sinal = sinal.mean(axis=1)

    if sinal.dtype == np.uint8:
        sinal = (sinal.astype(np.float64) - 128.0) / 128.0
    elif np.issubdtype(sinal.dtype, np.integer):
        sinal = sinal.astype(np.float64) / float(np.iinfo(sinal.dtype).max)
    else:
        sinal = sinal.astype(np.float64)

    audio = Audio(amostras=sinal, taxa=int(taxa))
    validar(audio)
    return audio


def validar(audio: Audio) -> None:
    if audio.taxa < 8000:
        raise ErroAudio("A taxa de amostragem precisa ser de pelo menos 8000 Hz.")
    if audio.duracao < 0.5:
        raise ErroAudio("A gravação precisa ter pelo menos 0,5 segundo.")
    if not np.any(np.abs(audio.amostras) > 1e-4):
        raise ErroAudio("A gravação está em silêncio.")


def reamostrar(sinal: np.ndarray, taxa: int, nova_taxa: int) -> np.ndarray:
    if taxa == nova_taxa:
        return sinal
    mdc = np.gcd(taxa, nova_taxa)
    return resample_poly(sinal, nova_taxa // mdc, taxa // mdc)
