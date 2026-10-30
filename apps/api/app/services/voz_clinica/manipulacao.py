"""Manipulação de pitch e duração com o Praat (como o "Manipulation" do Praat: PSOLA).

Uso clínico: o paciente ouve a própria voz num tom-alvo (mais aguda ou mais grave) ou mais
lenta/rápida, como modelo para a terapia. Só com o motor Praat (não há equivalente interno
com qualidade suficiente para escuta).
"""

from __future__ import annotations

import io

import numpy as np
from scipy.io import wavfile

from .audio import Audio
from . import motor_praat

SEMITONS_MAX = 12.0
FATOR_MIN, FATOR_MAX = 0.5, 2.0


class ErroManipulacao(ValueError):
    """Parâmetros fora do permitido."""


def disponivel() -> bool:
    return bool(motor_praat.DISPONIVEL)


def manipular(audio: Audio, semitons: float = 0.0, fator_duracao: float = 1.0,
              f0_min: float = 75.0, f0_max: float = 600.0) -> Audio:
    """Desloca a F0 em `semitons` (positivo = mais agudo) e multiplica a duração por `fator_duracao`
    (2 = duas vezes mais lento). Formantes e timbre ficam (PSOLA), ao contrário de acelerar a fita."""
    if not disponivel():
        raise RuntimeError("A manipulação precisa do Praat (Parselmouth) instalado no servidor.")
    if not np.isfinite(semitons) or abs(semitons) > SEMITONS_MAX:
        raise ErroManipulacao(f"Deslocamento de −{SEMITONS_MAX:g} a +{SEMITONS_MAX:g} semitons.")
    if not np.isfinite(fator_duracao) or not (FATOR_MIN <= fator_duracao <= FATOR_MAX):
        raise ErroManipulacao(f"Fator de duração de {FATOR_MIN:g} a {FATOR_MAX:g}.")
    call = motor_praat.call
    snd = motor_praat.parselmouth.Sound(audio.amostras, sampling_frequency=audio.taxa)
    manip = call(snd, "To Manipulation", 0.01, f0_min, f0_max)
    if semitons:
        tier = call(manip, "Extract pitch tier")
        call(tier, "Shift frequencies", snd.xmin, snd.xmax, float(semitons), "semitones")
        call([tier, manip], "Replace pitch tier")
    if fator_duracao != 1.0:
        dur = call("Create DurationTier", "duracao", snd.xmin, snd.xmax)
        call(dur, "Add point", snd.xmin, float(fator_duracao))
        call([dur, manip], "Replace duration tier")
    saida = call(manip, "Get resynthesis (overlap-add)")
    x = np.asarray(saida.values[0], dtype=float)
    pico = float(np.max(np.abs(x))) if len(x) else 0.0
    if pico > 0.99:  # o PSOLA pode passar um pouco de 1: normaliza para não estourar no WAV
        x = 0.99 * x / pico
    return Audio(x, int(saida.sampling_frequency))


def para_wav(audio: Audio) -> bytes:
    buf = io.BytesIO()
    wavfile.write(buf, audio.taxa, np.clip(audio.amostras * 32767, -32768, 32767).astype(np.int16))
    return buf.getvalue()
