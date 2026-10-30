"""F0 da fala (frequência fundamental habitual), parte do protocolo de voz.

A vogal sustentada mostra a estabilidade da fonte; a fala encadeada (leitura de um texto,
contagem de 1 a 20 ou fala espontânea) mostra a altura que a pessoa usa no dia a dia e
quanto ela varia (entonação). Medidas, sobre os quadros com voz:

- F0 média e mediana (Hz) e a nota mais próxima da mediana (A4 = 440 Hz);
- desvio-padrão (Hz e semitons) e faixa usada entre os percentis 5 e 95 (descarta os
  extremos, que na fala costumam ser erro de rastreio ou fry no fim das frases);
- tempo com voz, fração vozeada e pausas (silêncios de 250 ms ou mais);
- intensidade média em dBFS (relativa: sem calibração não há dB SPL).
"""

from __future__ import annotations

import numpy as np

from . import motor_interno, motor_praat
from .audio import Audio

PASSO = 0.01
PAUSA_MIN_S = 0.25
TAREFAS = ("leitura", "contagem", "espontanea")
NOTAS = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def _pitch(audio: Audio, f0_min: float, f0_max: float, motor: str):
    if motor == "praat":
        snd = motor_praat.parselmouth.Sound(audio.amostras, sampling_frequency=audio.taxa)
        pitch = snd.to_pitch_ac(time_step=PASSO, pitch_floor=f0_min, pitch_ceiling=f0_max)
        tempos = np.asarray(pitch.xs())
        f0s = np.asarray(pitch.selected_array["frequency"], dtype=float)
        f0s[f0s <= 0] = np.nan
        return tempos, f0s
    tempos, f0s, _ = motor_interno.rastrear_pitch(audio, f0_min, f0_max)
    return tempos, f0s


def nota(hz: float) -> str:
    """Nome da nota mais próxima (A4 = 440 Hz), como no fonetograma: 220 Hz -> A3."""
    midi = int(round(69 + 12 * np.log2(hz / 440.0)))
    return f"{NOTAS[midi % 12]}{midi // 12 - 1}"


def _pausas(tempos: np.ndarray, vozeado: np.ndarray) -> int:
    """Silêncios de 250 ms ou mais entre trechos com voz (não conta início e fim)."""
    idx = np.flatnonzero(vozeado)
    if len(idx) < 2:
        return 0
    lacunas = np.diff(tempos[idx])
    return int(np.sum(lacunas >= PAUSA_MIN_S + PASSO - 1e-9))


def analisar_fala(audio: Audio, motor: str, f0_min: float = 75.0, f0_max: float = 500.0, tarefa: str = "leitura") -> dict:
    if not (30 <= f0_min < f0_max <= 1200):
        raise ValueError("Faixa de F0 inválida: use 30 <= f0_min < f0_max <= 1200.")
    if tarefa not in TAREFAS:
        raise ValueError(f"Tarefa desconhecida: use {', '.join(TAREFAS)}.")
    if motor == "auto":
        motor = "praat" if motor_praat.DISPONIVEL else "interno"
    if motor == "praat" and not motor_praat.DISPONIVEL:
        raise ValueError("Motor praat indisponível: instale com 'pip install praat-parselmouth'.")
    if motor not in ("praat", "interno"):
        raise ValueError("Motor desconhecido: use auto, praat ou interno.")

    tempos, f0s = _pitch(audio, f0_min, f0_max, motor)
    f0s = motor_interno.corrigir_oitavas(f0s, f0_min, f0_max)
    vozeado = ~np.isnan(f0s)
    base = {"motor": motor, "tarefa": tarefa, "duracao_s": round(audio.duracao, 3)}
    tempo_voz = float(vozeado.sum() * PASSO)
    if tempo_voz < 1.0:
        return {**base, "avisos": ["Pouca voz na gravação (menos de 1 s). Peça a leitura do texto ou a contagem de 1 a 20."]}

    f = f0s[vozeado]
    st = 12 * np.log2(f / 16.35)
    p5, p95 = (float(v) for v in np.percentile(f, [5, 95]))
    mediana = float(np.median(f))

    janela = int(0.04 * audio.taxa)
    rms = []
    for t in tempos[vozeado]:
        ini = max(0, int(t * audio.taxa) - janela // 2)
        q = audio.amostras[ini : ini + janela]
        rms.append(np.mean(q**2))
    intensidade = 10 * np.log10(np.mean(rms) + 1e-24)

    avisos = []
    if audio.duracao < 8:
        avisos.append("Gravação curta: para a F0 da fala, use 15 a 30 s de leitura ou contagem.")
    if np.max(np.abs(audio.amostras)) >= 0.999:
        avisos.append("A gravação saturou (clipping); afaste o microfone e grave de novo.")
    avisos.append("Intensidade em dBFS (relativa): sem microfone calibrado não há dB SPL.")

    return {
        **base,
        "f0": {
            "media_hz": round(float(np.mean(f)), 2),
            "mediana_hz": round(mediana, 2),
            "nota_mediana": nota(mediana),
            "dp_hz": round(float(np.std(f)), 2),
            "dp_semitons": round(float(np.std(st)), 2),
            "p5_hz": round(p5, 2),
            "p95_hz": round(p95, 2),
            "faixa_semitons": round(float(12 * np.log2(p95 / p5)), 2),
        },
        "fala": {
            "tempo_vozeado_s": round(tempo_voz, 2),
            "fracao_vozeada_pct": round(100 * tempo_voz / max(audio.duracao, 1e-9), 1),
            "pausas": _pausas(tempos, vozeado),
            "intensidade_media_dbfs": round(float(intensidade), 2),
        },
        "avisos": avisos,
    }
