"""Avaliação clínica da voz (VoiceCheck IA 2.0): análise acústica, protocolos e índices."""

from __future__ import annotations

from . import motor_interno, motor_praat
from .audio import Audio, ErroAudio, ler_wav

__all__ = ["Audio", "ErroAudio", "ler_wav", "analisar", "motores_disponiveis"]


def motores_disponiveis() -> list[str]:
    return (["praat"] if motor_praat.DISPONIVEL else []) + ["interno"]


def analisar(audio: Audio, motor: str = "auto", f0_min: float = 75.0, f0_max: float = 600.0) -> dict:
    """Analisa o áudio. motor: "auto" (Praat se instalado), "praat" ou "interno"."""
    if not (30 <= f0_min < f0_max <= 1200):
        raise ValueError("Faixa de F0 inválida: use 30 <= f0_min < f0_max <= 1200.")
    if motor == "auto":
        motor = "praat" if motor_praat.DISPONIVEL else "interno"
    if motor == "praat":
        if not motor_praat.DISPONIVEL:
            raise ValueError("Motor praat indisponível: instale com 'pip install praat-parselmouth'.")
        return motor_praat.analisar(audio, f0_min, f0_max)
    if motor == "interno":
        return motor_interno.analisar(audio, f0_min, f0_max)
    raise ValueError("Motor desconhecido: use auto, praat ou interno.")
