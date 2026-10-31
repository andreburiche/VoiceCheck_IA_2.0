"""Modos de separação de instrumentos e parâmetros aceitos (API e worker usam a mesma regra).

Inspirado no que o Ultimate Vocal Remover (UVR) e o Filmora oferecem, só com modelos Demucs
(licença MIT) que rodam localmente:

- htdemucs_two  Voz + acompanhamento (modo rápido do Filmora).
- htdemucs      4 faixas: voz, bateria, baixo, outros.
- htdemucs_6s   6 faixas: + guitarra e piano ("todos os instrumentos").
- htdemucs_ft   4 faixas com o modelo afinado (fine-tuned): melhor qualidade, ~4x mais lento.

Qualidade (como "shifts"/"overlap" do UVR): mais passadas = menos artefato, mais tempo.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

#: código do modelo no produto → (modelo Demucs, faixas que saem)
MODELOS: dict[str, tuple[str, tuple[str, ...]]] = {
    "htdemucs": ("htdemucs", ("vocals", "drums", "bass", "other")),
    "htdemucs_two": ("htdemucs", ("vocals", "instrumental")),
    "htdemucs_6s": ("htdemucs_6s", ("vocals", "drums", "bass", "guitar", "piano", "other")),
    "htdemucs_ft": ("htdemucs_ft", ("vocals", "drums", "bass", "other")),
}

#: Quanto cada modelo custa em tempo, relativo ao htdemucs (para estimar o limite de tempo).
CUSTO_RELATIVO = {"htdemucs": 1.0, "htdemucs_two": 1.0, "htdemucs_6s": 1.3, "htdemucs_ft": 4.0}

Qualidade = Literal["rapida", "equilibrada", "maxima"]

#: qualidade → (shifts, overlap). shifts = passadas com o áudio deslocado (média reduz artefatos).
PRESETS_QUALIDADE: dict[str, tuple[int, float]] = {
    "rapida": (0, 0.25),
    "equilibrada": (1, 0.25),
    "maxima": (2, 0.5),
}


class ParametrosSeparacao(BaseModel):
    """`params` aceitos na criação de uma separação. Campos desconhecidos são recusados: tudo o que
    chega aqui vira argumento de linha de comando no worker."""

    model_config = ConfigDict(extra="forbid")

    #: Só os primeiros N segundos (prévia rápida para ouvir antes de separar a música inteira).
    preview_seconds: float | None = Field(default=None, ge=1, le=120)
    qualidade: Qualidade = "rapida"
    #: Avançado (sobrepõe a qualidade): passadas deslocadas, 0 a 5.
    shifts: int | None = Field(default=None, ge=0, le=5)
    #: Avançado: sobreposição entre trechos, 0,1 a 0,75.
    overlap: float | None = Field(default=None, ge=0.1, le=0.75)

    @model_validator(mode="after")
    def _arredonda(self) -> "ParametrosSeparacao":
        if self.overlap is not None:
            self.overlap = round(self.overlap, 2)
        return self


def opcoes_demucs(params: dict | None) -> tuple[int, float]:
    """(shifts, overlap) efetivos de um job (params já validados na API; o worker repete a checagem)."""
    p = ParametrosSeparacao.model_validate({k: v for k, v in (params or {}).items()
                                            if k in ParametrosSeparacao.model_fields})
    shifts, overlap = PRESETS_QUALIDADE[p.qualidade]
    if p.shifts is not None:
        shifts = p.shifts
    if p.overlap is not None:
        overlap = p.overlap
    return shifts, overlap


def tempo_limite_s(modelo: str, duracao_ms: int | None, shifts: int, base_s: float = 1800.0) -> float:
    """Tempo máximo da inferência: cresce com a duração, o modelo e as passadas (arquivos de até 1 h)."""
    minutos = max(1.0, (duracao_ms or 0) / 60000)
    estimado = minutos * 90 * CUSTO_RELATIVO.get(modelo, 1.0) * (1 + shifts)
    return max(base_s, min(estimado * 2, 6 * 3600))
