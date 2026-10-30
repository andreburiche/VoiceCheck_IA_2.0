"""VoiceCheck IA 2.0 — avaliação clínica da voz.

Análise acústica (F0, jitter, shimmer, HNR, CPPS, formantes, tempo de fonação),
protocolos de autoavaliação (IDV-10, QVV, EASE-BR), escala perceptiva (GRBASI),
anamnese vocal, DSI e planos de prática em casa (link para o celular do paciente).
Todo número é calculado aqui no servidor; quando um paciente é informado, o
resultado fica salvo para acompanhar a evolução entre sessões.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select

from app.api.v1.voicecheck import _read_limited
from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.api.v1.pratica_casa import plano_out, sessoes_por_plano
from app.models import ClinicalEvaluation, HomePracticePlan
from app.schemas.voz_clinica import (
    AnamneseEntrada,
    AvaliacaoLista,
    BiofeedbackEntrada,
    FonetogramaEntrada,
    JogoEntrada,
    AvaliacaoOut,
    DsiEntrada,
    PacienteLista,
    PacienteResumo,
    PlanoCriado,
    PlanoEntrada,
    PlanoLista,
    PlanoOut,
    ProtocoloEntrada,
    ResultadoSalvo,
    StatusOut,
)
from app.services import voz_clinica
from app.services.voz_clinica.fonetograma import resumir_campo
from app.services.voz_clinica.indices import dsi
from app.services.audit import write_audit
from app.services.voz_clinica.pratica import hash_token, novo_token
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


@router.post("/fonetograma", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_fonetograma(entrada: FonetogramaEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Guarda o campo vocal; o resumo é recalculado aqui a partir dos pontos."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente para salvar o fonetograma")
    pontos = sorted((p.model_dump() for p in entrada.pontos), key=lambda p: p["midi"])
    resultado = {
        "duracao_s": entrada.duracao_s,
        "pontos": pontos,
        "resumo": resumir_campo(pontos),
        "unidade_intensidade": "dBFS",
        "fonte": "navegador",
    }
    salvo = _salvar(db, user, nome, "fonetograma", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


@router.post("/anamnese", response_model=ResultadoSalvo, dependencies=[Depends(verify_csrf)])
def salvar_anamnese(entrada: AnamneseEntrada, user: CurrentUser, db: DbSession) -> ResultadoSalvo:
    """Guarda a anamnese vocal no histórico do paciente (só os campos preenchidos)."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente para salvar a anamnese")
    resultado = {k: v for k, v in entrada.model_dump(exclude={"paciente"}).items() if v not in (None, "", [])}
    salvo = _salvar(db, user, nome, "anamnese", resultado)
    return ResultadoSalvo(avaliacao_id=salvo, resultado=resultado)


#: Planos ativos por paciente: evita links esquecidos circulando.
MAX_PLANOS_ATIVOS = 3


@router.post("/pratica", response_model=PlanoCriado, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(verify_csrf)])
def criar_plano(entrada: PlanoEntrada, user: CurrentUser, db: DbSession) -> PlanoCriado:
    """Cria o plano e devolve o segredo do link UMA vez (só o hash fica salvo)."""
    nome = _paciente(entrada.paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente")
    agora = datetime.now(timezone.utc)
    ativos = db.scalars(
        select(HomePracticePlan).where(
            HomePracticePlan.owner_id == user.id, HomePracticePlan.patient_name == nome,
            HomePracticePlan.revoked_at.is_(None), HomePracticePlan.expires_at > agora,
        )
    ).all()
    if len(ativos) >= MAX_PLANOS_ATIVOS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{nome} já tem {len(ativos)} links ativos. Revogue um antes de criar outro.",
        )
    token = novo_token()
    plano = HomePracticePlan(
        owner_id=user.id, patient_name=nome, greeting=" ".join(entrada.saudacao.split()) or None,
        token_hash=hash_token(token),
        exercises=[e.model_dump(exclude_none=True) for e in entrada.exercicios],
        expires_at=agora + timedelta(days=entrada.validade_dias),
        # explícito em UTC: a conferência das sessões compara com esta data
        created_at=agora,
    )
    db.add(plano)
    db.commit()
    db.refresh(plano)
    base = plano_out(plano, {}, {})
    return PlanoCriado(**base.model_dump(), token=token)


@router.get("/pratica", response_model=PlanoLista)
def listar_planos(user: CurrentUser, db: DbSession, paciente: str) -> PlanoLista:
    nome = _paciente(paciente)
    if nome is None:
        return PlanoLista(items=[])
    planos = db.scalars(
        select(HomePracticePlan)
        .where(HomePracticePlan.owner_id == user.id, HomePracticePlan.patient_name == nome)
        .order_by(HomePracticePlan.created_at.desc())
        .limit(50)
    ).all()
    total, ultima = sessoes_por_plano(db, user.id, [p.id for p in planos])
    return PlanoLista(items=[plano_out(p, total, ultima) for p in planos])


@router.post("/pratica/{plano_id}/revogar", response_model=PlanoOut, dependencies=[Depends(verify_csrf)])
def revogar_plano(plano_id: str, user: CurrentUser, db: DbSession) -> PlanoOut:
    """O link para de funcionar na hora; as sessões já recebidas continuam no histórico."""
    plano = db.get(HomePracticePlan, plano_id)
    if plano is None or plano.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano não encontrado")
    if plano.revoked_at is None:
        plano.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(plano)
    total, ultima = sessoes_por_plano(db, user.id, [plano.id])
    return plano_out(plano, total, ultima)


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


def _nome_obrigatorio(paciente: str | None) -> str:
    nome = _paciente(paciente)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o paciente")
    return nome


def _rastro(user_id: str, nome: str) -> str:
    """Identifica o paciente no log de auditoria sem gravar o nome (minimização)."""
    return hashlib.sha256(f"{user_id}:{nome}".encode("utf-8")).hexdigest()[:16]


@router.get("/pacientes/exportar")
def exportar_paciente(request: Request, user: CurrentUser, db: DbSession, paciente: str | None = None) -> JSONResponse:
    """LGPD art. 18 (acesso e portabilidade): tudo o que está guardado deste paciente, sem limite."""
    nome = _nome_obrigatorio(paciente)
    rows = db.scalars(
        select(ClinicalEvaluation)
        .where(ClinicalEvaluation.owner_id == user.id, ClinicalEvaluation.patient_name == nome)
        .order_by(ClinicalEvaluation.created_at)
    ).all()
    planos = db.scalars(
        select(HomePracticePlan)
        .where(HomePracticePlan.owner_id == user.id, HomePracticePlan.patient_name == nome)
        .order_by(HomePracticePlan.created_at)
    ).all()
    if not rows and not planos:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nada guardado para este paciente")
    total, ultima = sessoes_por_plano(db, user.id, [p.id for p in planos])
    agora = datetime.now(timezone.utc)
    corpo = {
        "formato": "voicecheck-voz-clinica/1",
        "paciente": nome,
        "exportado_em": agora.isoformat(),
        "avaliacoes": [_saida(r).model_dump(mode="json") for r in rows],
        # o segredo dos links nunca é exportado (só o hash existe no banco, e ele também fica fora)
        "planos_pratica": [plano_out(p, total, ultima).model_dump(mode="json") for p in planos],
    }
    write_audit(
        db, action="voz_clinica.paciente_exportado", resource_type="paciente", actor_id=user.id, request=request,
        meta={"paciente": _rastro(user.id, nome), "avaliacoes": len(rows), "planos": len(planos)}, commit=True,
    )
    arquivo = "voicecheck-" + ("".join(c if c.isalnum() else "-" for c in nome.lower()).strip("-")[:40] or "paciente")
    return JSONResponse(
        corpo,
        headers={"Content-Disposition": f'attachment; filename="{arquivo}-{agora:%Y%m%d}.json"', "Cache-Control": "no-store"},
    )


@router.delete("/pacientes", dependencies=[Depends(verify_csrf)])
def excluir_paciente(request: Request, user: CurrentUser, db: DbSession, paciente: str | None = None) -> dict:
    """LGPD art. 18 (eliminação): apaga todas as avaliações e links de prática do paciente.

    Os links ativos param na hora (o plano deixa de existir). Irreversível.
    """
    nome = _nome_obrigatorio(paciente)
    filtro_aval = (ClinicalEvaluation.owner_id == user.id, ClinicalEvaluation.patient_name == nome)
    filtro_plano = (HomePracticePlan.owner_id == user.id, HomePracticePlan.patient_name == nome)
    n_aval = db.execute(delete(ClinicalEvaluation).where(*filtro_aval)).rowcount or 0
    n_planos = db.execute(delete(HomePracticePlan).where(*filtro_plano)).rowcount or 0
    if not n_aval and not n_planos:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nada guardado para este paciente")
    write_audit(
        db, action="voz_clinica.paciente_excluido", resource_type="paciente", actor_id=user.id, request=request,
        meta={"paciente": _rastro(user.id, nome), "avaliacoes": n_aval, "planos": n_planos},
    )
    db.commit()
    return {"avaliacoes_excluidas": n_aval, "planos_excluidos": n_planos}


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
    # explícito: com "from __future__ import annotations" o FastAPI lê "-> None" como o tipo
    # NoneType e recusa a rota 204 ("must not have a response body") — a API nem sobe
    response_model=None,
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
