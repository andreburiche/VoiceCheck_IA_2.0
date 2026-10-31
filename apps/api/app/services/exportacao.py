"""Parâmetros aceitos na exportação de faixas (API valida; o worker repete a checagem).

Além de WAV/MP3: FLAC (sem perda), M4A (AAC) e OGG. Tratamentos opcionais, como no Filmora:
reduzir ruído, realçar a voz e normalizar o volume; e cortar um trecho (início/fim).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Formato = Literal["wav", "mp3", "flac", "m4a", "ogg"]
Faixa = Literal["vocals", "drums", "bass", "other", "instrumental", "guitar", "piano"]

#: formato → (extensão, MIME)
FORMATOS: dict[str, tuple[str, str]] = {
    "wav": ("wav", "audio/wav"),
    "mp3": ("mp3", "audio/mpeg"),
    "flac": ("flac", "audio/flac"),
    "m4a": ("m4a", "audio/mp4"),
    "ogg": ("ogg", "audio/ogg"),
}


class ParametrosExportacao(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: Formato = "wav"
    bitrate: Literal["128k", "192k", "256k", "320k"] = "192k"
    #: Faixa exportada no tipo "stem".
    stem_type: Faixa | None = None
    #: Separação de origem (quando o projeto tem mais de uma).
    job_id: str | None = Field(default=None, min_length=36, max_length=36)
    #: Reduz chiado e ruído de fundo (filtro FFT do FFmpeg).
    reduzir_ruido: bool = False
    #: Realça a voz: corta graves de microfone, dá presença e compressão leve.
    realcar_voz: bool = False
    #: Normaliza o volume percebido (-16 LUFS, padrão de podcast/streaming).
    normalizar: bool = False
    #: Corte do trecho exportado, em segundos.
    inicio_s: float | None = Field(default=None, ge=0, le=6 * 3600)
    fim_s: float | None = Field(default=None, gt=0, le=6 * 3600)

    @model_validator(mode="after")
    def _trecho(self) -> "ParametrosExportacao":
        if self.inicio_s is not None and self.fim_s is not None and self.fim_s <= self.inicio_s:
            raise ValueError("O fim do trecho precisa vir depois do início")
        return self


def filtros_ffmpeg(p: ParametrosExportacao) -> str | None:
    """Cadeia -af do FFmpeg para os tratamentos escolhidos (só valores fixos, nada vindo do usuário)."""
    filtros: list[str] = []
    if p.reduzir_ruido:
        filtros += ["highpass=f=60", "afftdn=nr=12:nf=-40:tn=1"]
    if p.realcar_voz:
        filtros += ["highpass=f=90", "equalizer=f=3000:t=q:w=1.2:g=3", "equalizer=f=250:t=q:w=1:g=-2",
                    "acompressor=threshold=-18dB:ratio=3:attack=10:release=120:makeup=2"]
    if p.normalizar:
        filtros.append("loudnorm=I=-16:TP=-1.5:LRA=11")
    return ",".join(filtros) or None
