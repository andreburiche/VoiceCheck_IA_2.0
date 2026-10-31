"""Esquemas da avaliação clínica da voz (VoiceCheck IA 2.0)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
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
    "dsi", "fala", "ddk", "cepstral", "carga", "perceptiva", "sessao", "midia", "nasalancia", "egg", "documento",
]
ModeloDocumento = Literal[
    "devolutiva", "relatorio", "encaminhamento_orl", "encaminhamento", "comparecimento", "atestado",
    "plano", "orientacoes", "consentimento",
]
JogoId = Literal["altitude", "trilha", "sopro", "surdo-sonoro", "som-silencio"]


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


class CalibracaoSpl(BaseModel):
    """Calibração do microfone com decibelímetro (feita no navegador): dB SPL = dBFS + deslocamento."""

    deslocamento_db: float = Field(ge=40, le=160)
    referencia_db_spl: float = Field(ge=40, le=130)
    ponderacao: Literal["A", "C", "Z"]
    distancia_cm: float = Field(ge=5, le=100)
    microfone: str = Field(default="", max_length=120)
    #: sem fuso = UTC (gravada sempre com fuso, para o relatório não mudar de dia)
    data: DataUtc

    @model_validator(mode="after")
    def _coerente(self) -> "CalibracaoSpl":
        if self.data > datetime.now(timezone.utc) + timedelta(days=1) or self.data.year < 2000:
            raise ValueError("Data da calibração inválida")
        # o dBFS medido na calibração (referência − deslocamento) tem de ser um sinal real, sem saturar
        medido = self.referencia_db_spl - self.deslocamento_db
        if not (-60 <= medido <= 0):
            raise ValueError("Calibração incoerente: o nível medido no microfone ficaria fora de −60 a 0 dBFS")
        return self


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
    #: Microfone calibrado com decibelímetro: o servidor acrescenta os valores em dB SPL.
    calibracao: CalibracaoSpl | None = None

    @model_validator(mode="after")
    def _coerente(self) -> "BiofeedbackEntrada":
        if self.fonacao_s > self.duracao_s + 0.5:
            raise ValueError("tempo com voz maior que a duração da sessão")
        return self


class MinutoCarga(BaseModel):
    minuto: int = Field(ge=1, le=60)
    fonacao_pct: float = Field(ge=0, le=100)
    f0_mediana_hz: float | None = Field(default=None, ge=30, le=2000)
    db_mediano: float | None = Field(default=None, ge=-120, le=0)


class CargaEntrada(BaseModel):
    """Teste de carga vocal (lingWAVES): resumo medido no navegador; o áudio ao vivo não é enviado."""

    paciente: str = Field(min_length=1, max_length=120)
    duracao_s: float = Field(ge=0, le=3600)
    duracao_planejada_s: float = Field(ge=30, le=3600)
    fonacao_s: float = Field(ge=0, le=3600)
    alvo_dbfs: FaixaDb
    dentro_alvo_pct: float | None = Field(default=None, ge=0, le=100)
    f0_inicio_hz: float | None = Field(default=None, ge=30, le=2000)
    f0_fim_hz: float | None = Field(default=None, ge=30, le=2000)
    variacao_f0_st: float | None = Field(default=None, ge=-48, le=48)
    db_inicio: float | None = Field(default=None, ge=-120, le=0)
    db_fim: float | None = Field(default=None, ge=-120, le=0)
    variacao_db: float | None = Field(default=None, ge=-120, le=120)
    minutos: list[MinutoCarga] = Field(default_factory=list, max_length=60)
    #: Microfone calibrado com decibelímetro: o servidor acrescenta os valores em dB SPL.
    calibracao: CalibracaoSpl | None = None

    @model_validator(mode="after")
    def _coerente(self) -> "CargaEntrada":
        if self.fonacao_s > self.duracao_s + 0.5:
            raise ValueError("tempo com voz maior que a duração do teste")
        if [m.minuto for m in self.minutos] != list(range(1, len(self.minutos) + 1)):
            raise ValueError("minutos fora de ordem")
        return self


class JogoEntrada(BaseModel):
    """Resultado de uma partida de jogo de terapia (medido no navegador)."""

    paciente: str = Field(min_length=1, max_length=120)
    jogo: JogoId
    #: Variação do jogo (ex.: "ondas", "escada"); vazio = a padrão.
    variacao: str | None = Field(default=None, max_length=20, pattern=r"^[a-z-]*$")
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
    #: Sem calibração, só dBFS (relativo). Com ela, o resumo também sai em dB SPL.
    calibracao: CalibracaoSpl | None = None

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
    #: Anotação do profissional (PUT /avaliacoes/{id}/anotacao).
    anotacao: str | None = None


class AnotacaoEntrada(BaseModel):
    #: Texto livre; vazio apaga a anotação.
    texto: str = Field(max_length=4000)


class AvaliacaoLista(BaseModel):
    items: list[AvaliacaoOut]


class PacienteResumo(BaseModel):
    paciente: str
    avaliacoes: int
    ultima: DataUtc
    #: Há cadastro (data de nascimento, contato...) para este paciente.
    cadastro: bool = False
    #: Próxima consulta agendada (não cancelada) a partir de agora, se houver.
    proxima_consulta: DataUtc | None = None
    #: Consultas na agenda (todas as situações).
    consultas: int = 0


Sexo = Literal["feminino", "masculino", "outro"]


class CadastroEntrada(BaseModel):
    """Cadastro do paciente. Só o nome é obrigatório; campos vazios ficam sem valor."""

    paciente: str = Field(min_length=1, max_length=120)
    data_nascimento: date | None = None
    sexo: Sexo | None = None
    telefone: str | None = Field(default=None, max_length=30, pattern=r"^[0-9+()\-\s.]*$")
    email: str | None = Field(default=None, max_length=255, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    profissao: str | None = Field(default=None, max_length=120)
    profissional_da_voz: bool | None = None
    observacoes: str | None = Field(default=None, max_length=2000)

    @field_validator("data_nascimento")
    @classmethod
    def _nascimento(cls, v: date | None) -> date | None:
        if v is not None and not (date(1900, 1, 1) <= v <= date.today()):
            raise ValueError("data de nascimento fora do intervalo (1900 até hoje)")
        return v

    @field_validator("telefone", "email", "profissao", "observacoes")
    @classmethod
    def _vazio(cls, v: str | None) -> str | None:
        v = " ".join(v.split()) if v is not None and "\n" not in v else (v.strip() if v else v)
        return v or None


class CadastroOut(BaseModel):
    paciente: str
    data_nascimento: date | None = None
    idade: int | None = None
    sexo: Sexo | None = None
    telefone: str | None = None
    email: str | None = None
    profissao: str | None = None
    profissional_da_voz: bool | None = None
    observacoes: str | None = None
    atualizado_em: DataUtc


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


class SessaoEntrada(BaseModel):
    """Registro de uma sessão de terapia vocal (evolução), como o histórico de terapia do iVox."""

    paciente: str = Field(min_length=1, max_length=120)
    data: date
    objetivos: str | None = Field(default=None, max_length=1000)
    #: um exercício ou procedimento por linha
    exercicios: str | None = Field(default=None, max_length=2000)
    resposta: str | None = Field(default=None, max_length=1000)
    orientacoes: str | None = Field(default=None, max_length=1000)
    observacoes: str | None = Field(default=None, max_length=2000)


class ProfissionalDocumento(BaseModel):
    """Quem emite o documento (fica gravado junto: o histórico mostra quem assinou)."""

    nome: str = Field(min_length=1, max_length=120)
    #: ex.: "CRFa 2-12345"
    registro: str | None = Field(default=None, max_length=60)
    #: consultório, endereço ou telefone, numa linha
    contato: str | None = Field(default=None, max_length=200)
    cidade: str | None = Field(default=None, max_length=80)


class DocumentoEntrada(BaseModel):
    """Documento emitido para o paciente (devolutiva, encaminhamento, declaração, atestado...).

    O texto é escrito/revisado pelo profissional na tela; o servidor só guarda (texto puro,
    nunca HTML: a impressão escapa tudo)."""

    paciente: str = Field(min_length=1, max_length=120)
    modelo: ModeloDocumento
    titulo: str = Field(min_length=1, max_length=120)
    corpo: str = Field(min_length=1, max_length=20000)
    profissional: ProfissionalDocumento


class IaTextoEntrada(BaseModel):
    """Pedido de ajuda da IA num texto da aba Documentos (o nome do paciente já vem trocado por [PACIENTE])."""

    acao: Literal["melhorar", "corrigir", "formal", "simples", "resumir", "redigir"]
    texto: str = Field(default="", max_length=20000)
    modelo: ModeloDocumento
    #: o que o profissional quer (obrigatório em "redigir")
    pedido: str | None = Field(default=None, max_length=1000)


class IaTextoSaida(BaseModel):
    texto: str


class IaTextoStatus(BaseModel):
    disponivel: bool
    provedor: str | None = None
    modelo: str | None = None
    #: por que está indisponível (para a tela explicar)
    motivo: str | None = None


class NasalanciaEntrada(BaseModel):
    """Resumo da nasalância medida no navegador (2 canais: oral e nasal); o áudio não é enviado."""

    paciente: str = Field(min_length=1, max_length=120)
    tarefa: Literal["oral", "nasal", "balanceado", "vogal", "outro"]
    media_pct: float = Field(ge=0, le=100)
    dp_pct: float = Field(ge=0, le=100)
    mediana_pct: float = Field(ge=0, le=100)
    quadros: int = Field(ge=10, le=100_000)
    duracao_s: float = Field(gt=0, le=600)
    fonte: Literal["gravacao", "arquivo"]
    canais_invertidos: bool = False
    observacao: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _coerente(self) -> "NasalanciaEntrada":
        # o desvio-padrão de valores entre 0 e 100 não passa de 50; quadros de 20 ms cabem na duração
        if self.dp_pct > 50:
            raise ValueError("Desvio-padrão da nasalância impossível (acima de 50 %)")
        if self.quadros > self.duracao_s / 0.02 + 1:
            raise ValueError("Mais quadros de 20 ms do que cabem na duração informada")
        return self


class EggEntrada(BaseModel):
    """Resumo da eletroglotografia medida no navegador (quociente de contato); o sinal não é enviado."""

    paciente: str = Field(min_length=1, max_length=120)
    tarefa: Literal["vogal", "fala", "canto", "glissando", "outro"]
    cq_media_pct: float = Field(ge=0, le=100)
    cq_dp_pct: float = Field(ge=0, le=100)
    cq_mediana_pct: float = Field(ge=0, le=100)
    f0_media_hz: float = Field(gt=0, le=2000)
    ciclos: int = Field(ge=5, le=1_000_000)
    duracao_s: float = Field(gt=0, le=600)
    limiar_pct: Literal[25, 35, 50]
    canal_egg: Literal[1, 2]
    polaridade_invertida: bool = False

    @model_validator(mode="after")
    def _coerente(self) -> "EggEntrada":
        if self.cq_dp_pct > 50:
            raise ValueError("Desvio-padrão do quociente de contato impossível (acima de 50 %)")
        # cada ciclo dura em média 1/F0: não cabem muito mais que duração × F0 ciclos
        if self.ciclos > self.duracao_s * self.f0_media_hz * 1.5 + 5:
            raise ValueError("Mais ciclos do que cabem na duração e na F0 informadas")
        return self


# --- Agenda de consultas ---------------------------------------------------------------------

TipoConsulta = Literal["avaliacao", "terapia", "retorno", "reavaliacao", "outro"]
ModalidadeConsulta = Literal["presencial", "online", "domiciliar"]
SituacaoConsulta = Literal["agendada", "confirmada", "realizada", "faltou", "cancelada"]


def _inicio_valido(d: datetime) -> datetime:
    if d.tzinfo is None:
        raise ValueError("Informe o horário com fuso (ex.: 2026-11-03T14:00:00-03:00)")
    d = d.astimezone(timezone.utc)
    if not (2000 <= d.year <= 2100):
        raise ValueError("Data fora do intervalo aceito")
    return d.replace(second=0, microsecond=0)


class ConsultaEntrada(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paciente: str = Field(min_length=1, max_length=120)
    inicio: Annotated[datetime, AfterValidator(_inicio_valido)]
    duracao_min: int = Field(default=50, ge=10, le=480)
    tipo: TipoConsulta = "terapia"
    modalidade: ModalidadeConsulta = "presencial"
    situacao: SituacaoConsulta = "agendada"
    observacoes: str | None = Field(default=None, max_length=2000)
    #: Marcar mesmo que outro horário (não cancelado) se sobreponha.
    permitir_conflito: bool = False


class ConsultaOut(BaseModel):
    id: str
    paciente: str
    inicio: DataUtc
    fim: DataUtc
    duracao_min: int
    tipo: TipoConsulta
    modalidade: ModalidadeConsulta
    situacao: SituacaoConsulta
    observacoes: str | None = None
    atualizado_em: DataUtc


class ConsultaLista(BaseModel):
    items: list[ConsultaOut]
