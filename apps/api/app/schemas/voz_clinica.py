"""Esquemas da avaliação clínica da voz (VoiceCheck IA 2.0)."""

from __future__ import annotations

from datetime import datetime
from datetime import timezone
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

def _com_fuso(d: datetime) -> datetime:
    """O MySQL devolve DATETIME sem fuso (gravado em UTC). Sem o "+00:00", o navegador
    leria como horário local e mostraria a hora errada (3 h a mais no Brasil)."""
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)


DataUtc = Annotated[datetime, AfterValidator(_com_fuso)]

TipoAvaliacao = Literal[
    "acustica", "idv10", "qvv", "grbasi", "easebr", "anamnese", "biofeedback", "jogo", "fonetograma", "pratica",
    "dsi", "fala", "ddk", "cepstral",
]
JogoId = Literal["altitude", "trilha", "sopro", "surdo-sonoro"]


class ProtocoloEntrada(BaseModel):
    #: idv10/qvv: lista de 10 inteiros; easebr: 22 inteiros (opção marcada, 0-3); grbasi: {"G":0-3, ...}
    respostas: list[Any] | dict[str, Any]
    #: Se informado, o resultado é salvo para este paciente (espaços extras são removidos).
    paciente: str | None = Field(default=None, max_length=120)


class DsiEntrada(BaseModel):
    tmf_s: float = Field(ge=0, le=120)
    f0_alta_hz: float = Field(ge=0, le=3000)
    i_baixa_db_spl: float = Field(ge=0, le=140)
    jitter_pct: float = Field(ge=0, le=100)
    #: Se informado, o DSI fica salvo no histórico do paciente (com as quatro medidas usadas).
    paciente: str | None = Field(default=None, max_length=120)


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


class JogoEntrada(BaseModel):
    """Resultado de uma partida de jogo de terapia (medido no navegador)."""

    paciente: str = Field(min_length=1, max_length=120)
    jogo: JogoId
    duracao_s: float = Field(ge=0, le=3600)
    pontuacao_pct: float = Field(ge=0, le=100)
    #: Números do jogo (meta, melhor tempo, acertos…): até 12 chaves curtas.
    detalhes: dict[str, float] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _detalhes(self) -> "JogoEntrada":
        if len(self.detalhes) > 12:
            raise ValueError("detalhes demais")
        for chave, valor in self.detalhes.items():
            if not (1 <= len(chave) <= 32) or not chave.replace("_", "").isalnum():
                raise ValueError(f"chave inválida em detalhes: {chave!r}")
            if valor != valor or abs(valor) > 1e6:  # NaN ou absurdo
                raise ValueError(f"valor inválido em detalhes: {chave}")
        return self


class PontoCampo(BaseModel):
    midi: int = Field(ge=24, le=108)
    min_db: float = Field(ge=-120, le=0)
    max_db: float = Field(ge=-120, le=0)
    tempo_s: float = Field(ge=0, le=3600)

    @model_validator(mode="after")
    def _ordem(self) -> "PontoCampo":
        if self.min_db > self.max_db:
            raise ValueError("min_db maior que max_db")
        return self


class FonetogramaEntrada(BaseModel):
    """Pontos do campo vocal medidos no navegador; o resumo é recalculado no servidor."""

    paciente: str = Field(min_length=1, max_length=120)
    duracao_s: float = Field(ge=0, le=3600)
    pontos: list[PontoCampo] = Field(min_length=1, max_length=85)

    @model_validator(mode="after")
    def _unicos(self) -> "FonetogramaEntrada":
        midis = [p.midi for p in self.pontos]
        if len(set(midis)) != len(midis):
            raise ValueError("semitom repetido nos pontos")
        return self


class ResultadoSalvo(BaseModel):
    """Resposta de análise/protocolo: o resultado e, se salvo, o id do registro."""

    avaliacao_id: str | None = None
    resultado: dict[str, Any]
    #: Análise acústica salva com paciente: a gravação foi guardada para ouvir/comparar depois?
    audio_guardado: bool | None = None
    #: Motivo de não guardar (cota cheia, falha no storage), para avisar na tela.
    aviso_audio: str | None = None


class AvaliacaoOut(BaseModel):
    id: str
    paciente: str
    tipo: TipoAvaliacao
    motor: str | None = None
    resultado: dict[str, Any]
    criado_em: DataUtc
    #: Há gravação guardada (GET /avaliacoes/{id}/audio).
    audio: bool = False


class AvaliacaoLista(BaseModel):
    items: list[AvaliacaoOut]


class PacienteResumo(BaseModel):
    paciente: str
    avaliacoes: int
    ultima: DataUtc


class PacienteLista(BaseModel):
    items: list[PacienteResumo]


class StatusOut(BaseModel):
    motores: list[str]
    protocolos: list[str]


# ---------------------------------------------------------------------------
# Anamnese vocal
# ---------------------------------------------------------------------------

Sintoma = Literal[
    "rouquidao", "cansaco_vocal", "falhas_na_voz", "perda_de_agudos", "voz_fraca",
    "dor_ao_falar", "pigarro", "tosse", "corpo_estranho", "falta_de_ar_ao_falar",
]
SIM_NAO = bool | None


class AnamneseEntrada(BaseModel):
    """Anamnese vocal estruturada. Todos os campos são opcionais, mas ao menos um precisa vir preenchido."""

    model_config = ConfigDict(extra="forbid")

    paciente: str = Field(min_length=1, max_length=120)
    queixa: str = Field(default="", max_length=1000)
    inicio: Literal["menos_1_mes", "1_a_6_meses", "6_a_12_meses", "mais_1_ano"] | None = None
    evolucao: Literal["melhorando", "estavel", "piorando", "flutuante"] | None = None
    sintomas: list[Sintoma] = Field(default_factory=list, max_length=10)
    profissao: str = Field(default="", max_length=120)
    uso_profissional: Literal["nao", "fala", "canto", "fala_e_canto"] | None = None
    horas_voz_dia: float | None = Field(default=None, ge=0, le=24)
    canto_estilo: str = Field(default="", max_length=120)
    aulas_canto: SIM_NAO = None
    tabagismo: Literal["nunca", "ex", "atual"] | None = None
    alcool: Literal["nao", "ocasional", "frequente"] | None = None
    agua_copos_dia: int | None = Field(default=None, ge=0, le=40)
    refluxo: SIM_NAO = None
    alergia_respiratoria: SIM_NAO = None
    perda_auditiva: SIM_NAO = None
    fono_anterior: SIM_NAO = None
    cirurgias: str = Field(default="", max_length=500)
    medicamentos: str = Field(default="", max_length=500)
    observacoes: str = Field(default="", max_length=4000)

    @field_validator("queixa", "profissao", "canto_estilo", "cirurgias", "medicamentos", "observacoes")
    @classmethod
    def _limpar(cls, v: str) -> str:
        return v.strip()

    @field_validator("sintomas")
    @classmethod
    def _sem_repetir(cls, v: list[str]) -> list[str]:
        if len(set(v)) != len(v):
            raise ValueError("sintoma repetido")
        return v

    @model_validator(mode="after")
    def _algo_preenchido(self) -> "AnamneseEntrada":
        dados = self.model_dump(exclude={"paciente"})
        if not any(v not in (None, "", []) for v in dados.values()):
            raise ValueError("preencha ao menos um campo da anamnese")
        return self


# ---------------------------------------------------------------------------
# Prática em casa
# ---------------------------------------------------------------------------

TipoExercicio = Literal["sustentar", "pitch", "volume"]


class ExercicioPratica(BaseModel):
    """Um exercício do plano. sustentar: vogal longa (meta opcional); pitch/volume: manter a voz numa faixa."""

    model_config = ConfigDict(extra="forbid")

    tipo: TipoExercicio
    titulo: str = Field(min_length=1, max_length=60)
    instrucao: str = Field(default="", max_length=300)
    repeticoes: int = Field(ge=1, le=10)
    #: pitch/volume: duração de cada tentativa. sustentar: ignorado (vai até a voz parar, máx. 60 s).
    duracao_s: float | None = Field(default=None, ge=3, le=60)
    meta_s: float | None = Field(default=None, ge=1, le=60)
    faixa_hz: FaixaHz | None = None
    faixa_db: FaixaDb | None = None

    @field_validator("titulo", "instrucao")
    @classmethod
    def _limpar(cls, v: str) -> str:
        return " ".join(v.split()) if "\n" not in v else v.strip()

    @model_validator(mode="after")
    def _coerente(self) -> "ExercicioPratica":
        if not self.titulo:
            raise ValueError("título vazio")
        if self.tipo == "sustentar":
            if self.faixa_hz or self.faixa_db or self.duracao_s:
                raise ValueError("sustentar não usa faixa nem duração fixa")
        else:
            if self.duracao_s is None:
                raise ValueError(f"{self.tipo}: informe a duração de cada tentativa")
            if self.meta_s is not None:
                raise ValueError(f"{self.tipo}: meta em segundos só vale para sustentar")
            if self.tipo == "pitch" and (self.faixa_hz is None or self.faixa_db is not None):
                raise ValueError("pitch: informe só a faixa em Hz")
            if self.tipo == "volume" and (self.faixa_db is None or self.faixa_hz is not None):
                raise ValueError("volume: informe só a faixa em dBFS")
        return self


class PlanoEntrada(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paciente: str = Field(min_length=1, max_length=120)
    #: Como o celular chama o paciente ("Olá, Ana"). Vazio = sem nome na página do celular.
    saudacao: str = Field(default="", max_length=60)
    exercicios: list[ExercicioPratica] = Field(min_length=1, max_length=6)
    validade_dias: int = Field(default=30, ge=1, le=180)


class PlanoOut(BaseModel):
    id: str
    paciente: str
    saudacao: str
    exercicios: list[dict[str, Any]]
    criado_em: DataUtc
    expira_em: DataUtc
    revogado_em: DataUtc | None
    ativo: bool
    sessoes: int
    ultima_sessao: DataUtc | None


class PlanoCriado(PlanoOut):
    #: Mostrado uma única vez: só o hash fica salvo.
    token: str


class PlanoLista(BaseModel):
    items: list[PlanoOut]


class PlanoPublico(BaseModel):
    """O que o celular recebe: sem nome completo, sem histórico."""

    saudacao: str
    exercicios: list[dict[str, Any]]
    expira_em: DataUtc


class RepeticaoPratica(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duracao_s: float = Field(ge=0, le=120)
    fonacao_s: float = Field(ge=0, le=120)
    dentro_pct: float | None = Field(default=None, ge=0, le=100)
    f0_mediana_hz: float | None = Field(default=None, ge=30, le=2000)


class SessaoPratica(BaseModel):
    model_config = ConfigDict(extra="forbid")

    #: Gerado no celular (UUID): reenviar a mesma sessão não duplica.
    id: str = Field(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    exercicio: int = Field(ge=0, le=5)
    feito_em: datetime
    repeticoes: list[RepeticaoPratica] = Field(min_length=1, max_length=10)


class SessoesEntrada(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sessoes: list[SessaoPratica] = Field(min_length=1, max_length=50)


class SessaoRecusada(BaseModel):
    id: str
    motivo: str


class SincronizacaoOut(BaseModel):
    #: Gravadas agora ou já recebidas antes: o celular pode apagar da fila.
    recebidas: list[str]
    #: Não combinam com o plano: o celular também apaga (reenviar não adianta).
    recusadas: list[SessaoRecusada]
