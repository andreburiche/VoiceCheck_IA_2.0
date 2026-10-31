"""Agenda de consultas da avaliação clínica (VoiceCheck IA 2.0).

Só o fonoaudiólogo (ou administrador) usa, e cada um vê apenas a própria agenda: toda consulta é
buscada por id **e** dono. O nome do paciente vai no corpo (POST/PUT) ou no cabeçalho X-Paciente
(GET), nunca na URL. O log de auditoria guarda um rastro (HMAC) do paciente, não o nome.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select

from app.api.v1.voz_clinica import PacienteConsulta, _paciente, _rastro
from app.core.deps import CurrentUser, DbSession, require_clinico_registrado, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.models import ClinicalAppointment
from app.schemas.voz_clinica import ConsultaEntrada, ConsultaLista, ConsultaOut
from app.services.audit import write_audit

router = APIRouter(prefix="/voz-clinica/agenda", tags=["voz-clinica"], dependencies=[Depends(require_clinico_registrado)])

#: Maior intervalo de uma consulta à agenda (um ano e pouco: visão anual, relatórios).
MAX_INTERVALO = timedelta(days=400)
#: Consultas por profissional (proteção contra abuso; uma agenda cheia por 10 anos cabe folgada).
MAX_CONSULTAS = 20_000


def _utc(d: datetime) -> datetime:
    """O MySQL devolve DATETIME sem fuso (gravado em UTC)."""
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d.astimezone(timezone.utc)


def _saida(c: ClinicalAppointment) -> ConsultaOut:
    inicio = _utc(c.starts_at)
    return ConsultaOut(
        id=c.id, paciente=c.patient_name, inicio=inicio, fim=inicio + timedelta(minutes=c.duration_min),
        duracao_min=c.duration_min, tipo=c.kind, modalidade=c.modality, situacao=c.status,
        observacoes=c.notes, atualizado_em=c.updated_at,
    )


def _consulta_do_usuario(db: DbSession, user: CurrentUser, consulta_id: str) -> ClinicalAppointment:
    try:
        ident = str(uuid.UUID(consulta_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consulta não encontrada") from exc
    c = db.scalar(select(ClinicalAppointment).where(ClinicalAppointment.id == ident,
                                                    ClinicalAppointment.owner_id == user.id))
    if c is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consulta não encontrada")
    return c


def _nome(valor: str) -> str:
    nome = _paciente(valor)
    if nome is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe o paciente")
    return nome


def _conflitos(db: DbSession, user: CurrentUser, inicio: datetime, duracao: int, ignorar: str | None) -> list[ClinicalAppointment]:
    """Consultas não canceladas que se sobrepõem a [inicio, inicio + duracao)."""
    fim = inicio + timedelta(minutes=duracao)
    candidatas = db.scalars(
        select(ClinicalAppointment).where(
            ClinicalAppointment.owner_id == user.id,
            ClinicalAppointment.status != "cancelada",
            ClinicalAppointment.starts_at < fim,
            ClinicalAppointment.starts_at > inicio - timedelta(minutes=480),
        )
    ).all()
    return [c for c in candidatas if c.id != ignorar
            and _utc(c.starts_at) < fim and _utc(c.starts_at) + timedelta(minutes=c.duration_min) > inicio]


def _checar_conflito(db: DbSession, user: CurrentUser, e: ConsultaEntrada, ignorar: str | None = None) -> None:
    if e.permitir_conflito or e.situacao == "cancelada":
        return
    outras = _conflitos(db, user, e.inicio, e.duracao_min, ignorar)
    if outras:
        primeira = min(outras, key=lambda c: c.starts_at)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(f"Horário ocupado: já há consulta de {primeira.patient_name} às "
                    f"{_utc(primeira.starts_at).isoformat()}. Marque 'agendar mesmo assim' para encaixar."),
        )


@router.get("", response_model=ConsultaLista)
def listar(
    user: CurrentUser,
    db: DbSession,
    paciente: PacienteConsulta,
    de: datetime | None = Query(default=None, description="Início do intervalo (ISO com fuso)"),
    ate: datetime | None = Query(default=None, description="Fim do intervalo (ISO com fuso)"),
) -> ConsultaLista:
    """Consultas do intervalo [de, ate) ou, com X-Paciente, todas as do paciente (até 1000)."""
    stmt = select(ClinicalAppointment).where(ClinicalAppointment.owner_id == user.id)
    nome = _paciente(paciente)
    if nome is not None:
        stmt = stmt.where(ClinicalAppointment.patient_name == nome)
    if de is not None or ate is not None:
        if de is None or ate is None or de.tzinfo is None or ate.tzinfo is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe 'de' e 'ate' com fuso horário")
        de, ate = _utc(de), _utc(ate)
        if not (timedelta(0) < ate - de <= MAX_INTERVALO):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Intervalo inválido (máximo de 400 dias)")
        stmt = stmt.where(ClinicalAppointment.starts_at >= de, ClinicalAppointment.starts_at < ate)
    elif nome is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe o intervalo ou o paciente")
    rows = db.scalars(stmt.order_by(ClinicalAppointment.starts_at).limit(1000)).all()
    return ConsultaLista(items=[_saida(c) for c in rows])


@router.post("", response_model=ConsultaOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
def agendar(request: Request, entrada: ConsultaEntrada, user: CurrentUser, db: DbSession) -> ConsultaOut:
    enforce_rate_limit(request, bucket="agenda_escrita", limit=120, window_sec=600)
    nome = _nome(entrada.paciente)
    total = db.query(ClinicalAppointment).filter(ClinicalAppointment.owner_id == user.id).count()
    if total >= MAX_CONSULTAS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Limite de consultas na agenda atingido")
    _checar_conflito(db, user, entrada)
    c = ClinicalAppointment(
        owner_id=user.id, patient_name=nome, starts_at=entrada.inicio, duration_min=entrada.duracao_min,
        kind=entrada.tipo, modality=entrada.modalidade, status=entrada.situacao,
        notes=(entrada.observacoes or "").strip() or None,
    )
    db.add(c)
    db.flush()
    write_audit(db, action="voz_clinica.consulta_agendada", resource_type="consulta", resource_id=c.id,
                actor_id=user.id, request=request, meta={"paciente": _rastro(user.id, nome)})
    db.commit()
    db.refresh(c)
    return _saida(c)


@router.put("/{consulta_id}", response_model=ConsultaOut, dependencies=[Depends(verify_csrf)])
def atualizar(request: Request, consulta_id: str, entrada: ConsultaEntrada, user: CurrentUser, db: DbSession) -> ConsultaOut:
    """Remarcar, mudar a situação (confirmada, realizada, faltou, cancelada) ou as observações."""
    enforce_rate_limit(request, bucket="agenda_escrita", limit=120, window_sec=600)
    c = _consulta_do_usuario(db, user, consulta_id)
    nome = _nome(entrada.paciente)
    _checar_conflito(db, user, entrada, ignorar=c.id)
    antes = c.status
    c.patient_name, c.starts_at, c.duration_min = nome, entrada.inicio, entrada.duracao_min
    c.kind, c.modality, c.status = entrada.tipo, entrada.modalidade, entrada.situacao
    c.notes = (entrada.observacoes or "").strip() or None
    write_audit(db, action="voz_clinica.consulta_alterada", resource_type="consulta", resource_id=c.id,
                actor_id=user.id, request=request,
                meta={"paciente": _rastro(user.id, nome), "situacao": [antes, entrada.situacao]})
    db.commit()
    db.refresh(c)
    return _saida(c)


# response_model=None: com "from __future__ import annotations" o "-> None" impediria a rota 204 de subir
@router.delete("/{consulta_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, dependencies=[Depends(verify_csrf)])
def excluir(request: Request, consulta_id: str, user: CurrentUser, db: DbSession) -> None:
    c = _consulta_do_usuario(db, user, consulta_id)
    write_audit(db, action="voz_clinica.consulta_excluida", resource_type="consulta", resource_id=c.id,
                actor_id=user.id, request=request, meta={"paciente": _rastro(user.id, c.patient_name)})
    db.delete(c)
    db.commit()
