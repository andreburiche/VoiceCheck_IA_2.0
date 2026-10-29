"""VoiceCheck IA 2.0 — avaliação clínica da voz.

Análise acústica (F0, jitter, shimmer, HNR, CPPS, formantes, tempo de fonação),
protocolos de autoavaliação (IDV-10, QVV), escala perceptiva (GRBASI) e DSI.
Todo número é calculado aqui no servidor; quando um paciente é informado, o
resultado fica salvo para acompanhar a evolução entre sessões.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select

from app.api.v1.voicecheck import _read_limited
from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.models import ClinicalEvaluation
from app.schemas.voz_clinica import (
    AvaliacaoLista,
    BiofeedbackEntrada,
    JogoEntrada,
    AvaliacaoOut,
    DsiEntrada,
    PacienteLista,
    PacienteResumo,
    ProtocoloEntrada,
    ResultadoSalvo,
    StatusOut,
)
from app.services import voz_clinica
from app.services.voz_clinica.indices import dsi
from app.services.voz_clinica.protocolos import PROTOCOLOS, ErroProtocolo

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voz-clinica", tags=["voz-clinica"])
settings = get_settings()

#: Gravação de vogal sustentada ou fala curta: 30 MB cobre ~5 min de WAV 48 kHz.
MAX_WAV_BYTES = 30 * 1024 * 1024


def _paciente(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = " ".join(valor.split())
    if len(valor) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome do paciente com mais de 120 caracteres")
    return valor or None


def _salvar(db: DbSession, user: CurrentUser, paciente: str | None, tipo: str,
            resultado: dict, motor: str | None = None) -> str | None:
    if paciente is None:
        return None
    row = ClinicalEvaluation(owner_id=user.id, patient_name=paciente, kind=tipo, engine=motor, result=resultado)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.id


def _saida(row: ClinicalEvaluation) -> AvaliacaoOut:
    return AvaliacaoOut(
        id=row.id, paciente=row.patient_name, tipo=row.kind, motor=row.engine,
        resultado=row.result, criado_em=row.created_at,
    )


@router.get("/status", response_model=StatusOut)
def status_servico(user: CurrentUser) -> StatusOut:
    return StatusOut(motores=voz_clinica.motores_disponiveis(), protocolos=list(PROTOCOLOS))


@router.post("/analisar", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
async def analisar(
    request: Request,
    user: CurrentUser,
    db: DbSession,
    file: UploadFile = File(...),
    f0_min: float = Form(75.0),
    f0_max: float = Form(600.0),
    motor: str = Form("auto"),
    paciente: str | None = Form(None),
) -> ResultadoSalvo:
    """Recebe um WAV sem compressão (vogal sustentada) e devolve as medidas acústicas."""
    enforce_rate_limit(
        request,
        bucket="voz_clinica",
        limit=max(5, settings.rate_limit_upload // 2),
        window_sec=settings.rate_limit_upload_window_sec,
    )
    nome = _paciente(paciente)
    dados = await _read_limited(file, MAX_WAV_BYTES)
    def _rodar() -> dict:
        audio = voz_clinica.ler_wav(dados)
        return voz_clinica.analisar(audio, motor=motor, f0_min=f0_min, f0_max=f0_max)

    try:
        # cálculo pesado em thread, para não travar as outras requisições
        resultado = await asyncio.to_thread(_rodar)
    except (voz_clinica.ErroAudio, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — falha inesperada do motor
        logger.exception("Voz clínica: falha na análise")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Não foi possível analisar a gravação") from exc

    salvo = _salvar(db, user, nome, "acustica", resultado, resultado.get("motor")) if "f0" in resultado else None
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/protocolos/{nome}", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def calcular_protocolo(nome: str, entrada: ProtocoloEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    funcao = PROTOCOLOS.get(nome.lower())
    if funcao is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Protocolo desconhecido: use {', '.join(PROTOCOLOS)}")
    try:
        resultado = funcao(entrada.respostas)
    except ErroProtocolo as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    salvo = _salvar(db, user, _paciente(entrada.paciente), nome.lower(), resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/biofeedback", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_biofeedback(entrada: BiofeedbackEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Guarda o resumo de uma sessão de biofeedback no histórico do paciente."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente para salvar a sessão")
    resultado = {**entrada.model_dump(exclude={"paciente"}), "fonte": "navegador"}
    salvo = _salvar(db, user, nome, "biofeedback", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/jogos", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_jogo(entrada: JogoEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Guarda o resultado de uma partida no histórico do paciente."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente para salvar a partida")
    resultado = {**entrada.model_dump(exclude={"paciente"}), "fonte": "navegador"}
    salvo = _salvar(db, user, nome, "jogo", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/dsi", dependencies=[Depends(verify_csrf)])
def calcular_dsi(entrada: DsiEntrada, user: CurrentUser) -> dict:
    return dsi(entrada.tmf_s, entrada.f0_alta_hz, entrada.i_baixa_db_spl, entrada.jitter_pct)


@router.get("/pacientes", response_model=PacienteLista)
def listar_pacientes(user: CurrentUser, db: DbSession) -> PacienteLista:
    linhas = db.execute(
        select(
            ClinicalEvaluation.patient_name,
            func.count(ClinicalEvaluation.id),
            func.max(ClinicalEvaluation.created_at),
        )
        .where(ClinicalEvaluation.owner_id == user.id)
        .group_by(ClinicalEvaluation.patient_name)
        .order_by(func.max(ClinicalEvaluation.created_at).desc())
        .limit(1000)
    ).all()
    return PacienteLista(items=[PacienteResumo(paciente=n, avaliacoes=c, ultima=u) for n, c, u in linhas])


@router.get("/avaliacoes", response_model=AvaliacaoLista)
def listar_avaliacoes(user: CurrentUser, db: DbSession, paciente: str | None = None) -> AvaliacaoLista:
    stmt = select(ClinicalEvaluation).where(ClinicalEvaluation.owner_id == user.id)
    nome = _paciente(paciente)
    if nome is not None:
        stmt = stmt.where(ClinicalEvaluation.patient_name == nome)
    rows = db.scalars(stmt.order_by(ClinicalEvaluation.created_at.desc()).limit(500)).all()
    return AvaliacaoLista(items=[_saida(r) for r in rows])


@router.delete(
    "/avaliacoes/{avaliacao_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(verify_csrf)],
)
def excluir_avaliacao(avaliacao_id: str, user: CurrentUser, db: DbSession) -> None:
    try:
        ident = str(uuid.UUID(avaliacao_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avaliação não encontrada") from exc
    row = db.scalar(
        select(ClinicalEvaluation).where(ClinicalEvaluation.id == ident, ClinicalEvaluation.owner_id == user.id)
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avaliação não encontrada")
    db.delete(row)
    db.commit()
