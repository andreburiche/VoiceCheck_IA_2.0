"""Esquemas da avaliação clínica da voz (VoiceCheck IA 2.0)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

TipoAvaliacao = Literal["acustica", "idv10", "qvv", "grbasi"]


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
