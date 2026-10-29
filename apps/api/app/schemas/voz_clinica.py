"""Esquemas da avaliação clínica da voz (VoiceCheck IA 2.0)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

TipoAvaliacao = Literal["acustica", "idv10", "qvv", "grbasi", "biofeedback"]


class ProtocoloEntrada(BaseModel):
    #: idv10/qvv: lista de 10 inteiros; grbasi: {"G":0-3, ...}
    respostas: list[Any] | dict[str, Any]
    #: Se informado, o resultado é salvo para este paciente (espaços extras são removidos).
    paciente: str | None = Field(default=None, max_length=120)


class DsiEntrada(BaseModel):
    tmf_s: float = Field(ge=0, le=120)
    f0_alta_hz: float = Field(ge=0, le=3000)
    i_baixa_db_spl: float = Field(ge=0, le=140)
    jitter_pct: float = Field(ge=0, le=100)


class Faixa(BaseModel):
    min: float
    max: float

    @model_validator(mode="after")
    def _ordem(self) -> "Faixa":
        if self.min >= self.max:
            raise ValueError("min precisa ser menor que max")
        return self


class FaixaHz(Faixa):
    min: float = Field(ge=30, le=2000)
    max: float = Field(ge=30, le=2000)


class FaixaDb(Faixa):
    min: float = Field(ge=-120, le=0)
    max: float = Field(ge=-120, le=0)


class BiofeedbackEntrada(BaseModel):
    """Resumo de uma sessão de biofeedback, medido no navegador (o áudio ao vivo não é enviado)."""

    paciente: str = Field(min_length=1, max_length=120)
    duracao_s: float = Field(ge=0, le=3600)
    fonacao_s: float = Field(ge=0, le=3600)
    alvo_pitch_hz: FaixaHz
    alvo_volume_dbfs: FaixaDb
    dentro_pitch_pct: float | None = Field(default=None, ge=0, le=100)
    dentro_volume_pct: float | None = Field(default=None, ge=0, le=100)
    f0_p10_hz: float | None = Field(default=None, ge=30, le=2000)
    f0_mediana_hz: float | None = Field(default=None, ge=30, le=2000)
    f0_p90_hz: float | None = Field(default=None, ge=30, le=2000)
    db_mediano: float | None = Field(default=None, ge=-120, le=0)

    @model_validator(mode="after")
    def _coerente(self) -> "BiofeedbackEntrada":
        if self.fonacao_s > self.duracao_s + 0.5:
            raise ValueError("tempo com voz maior que a duração da sessão")
        return self


class ResultadoSalvo(BaseModel):
    """Resposta de análise/protocolo: o resultado e, se salvo, o id do registro."""

    avaliacao_id: str | None = None
    resultado: dict[str, Any]


class AvaliacaoOut(BaseModel):
    id: str
    paciente: str
    tipo: TipoAvaliacao
    motor: str | None = None
    resultado: dict[str, Any]
    criado_em: datetime


class AvaliacaoLista(BaseModel):
    items: list[AvaliacaoOut]


class PacienteResumo(BaseModel):
    paciente: str
    avaliacoes: int
    ultima: datetime


class PacienteLista(BaseModel):
    items: list[PacienteResumo]


class StatusOut(BaseModel):
    motores: list[str]
    protocolos: list[str]
