"""VoiceCheck IA 2.0 — prática em casa: rotas públicas do celular do paciente.

Não há login: o celular manda o segredo do link no cabeçalho X-Pratica-Token
(o link leva o segredo depois do "#", que o navegador não envia ao servidor e
não fica em log). O token só permite ler os exercícios do plano e enviar
resultados; o histórico do paciente nunca sai por aqui. Sem cookie, não há
CSRF a proteger.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import DbSession
from app.core.rate_limit import enforce_rate_limit
from app.models import ClinicalEvaluation, HomePracticePlan
from app.schemas.voz_clinica import (
    PlanoOut,
    PlanoPublico,
    SessaoRecusada,
    SessoesEntrada,
    SincronizacaoOut,
)
from app.services.voz_clinica.pratica import ErroSessao, conferir_data, hash_token, plano_ativo, resumir_sessao

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pratica-casa", tags=["pratica-casa"])

TIPO = "pratica"
#: Depois que o link expira, o celular ainda pode enviar o que foi feito offline antes disso.
GRACA_ENVIO = timedelta(days=7)
#: Tetos contra inundar o histórico (quem tem o link pode enviar sessões inventadas).
#: Folgados para o uso real: 6 exercícios feitos 3 vezes ao dia dão 18.
MAX_SESSOES_DIA = 24
MAX_SESSOES_PLANO = 400


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def sessoes_por_plano(db, owner_id: str, plano_ids: list[str]) -> tuple[dict[str, int], dict[str, datetime]]:
    """Quantas sessões cada plano recebeu e a data da última (contadas no banco)."""
    if not plano_ids:
        return {}, {}
    linhas = db.execute(
        select(ClinicalEvaluation.practice_plan_id, func.count(ClinicalEvaluation.id), func.max(ClinicalEvaluation.created_at))
        .where(ClinicalEvaluation.owner_id == owner_id, ClinicalEvaluation.practice_plan_id.in_(plano_ids))
        .group_by(ClinicalEvaluation.practice_plan_id)
    ).all()
    return {pid: n for pid, n, _ in linhas}, {pid: u for pid, _, u in linhas}


def _contar(db, plano_id: str, desde: datetime | None = None, ate: datetime | None = None) -> int:
    q = select(func.count(ClinicalEvaluation.id)).where(ClinicalEvaluation.practice_plan_id == plano_id)
    if desde is not None and ate is not None:
        # gravado sem fuso no MySQL (UTC): compara com datas UTC sem fuso
        q = q.where(ClinicalEvaluation.created_at >= desde.replace(tzinfo=None), ClinicalEvaluation.created_at < ate.replace(tzinfo=None))
    return int(db.scalar(q) or 0)


def plano_out(p: HomePracticePlan, total: Mapping[str, int], ultima: Mapping[str, datetime]) -> PlanoOut:
    return PlanoOut(
        id=p.id,
        paciente=p.patient_name,
        saudacao=p.greeting or "",
        exercicios=p.exercises,
        criado_em=p.created_at,
        expira_em=p.expires_at,
        revogado_em=p.revoked_at,
        ativo=plano_ativo(p.expires_at, p.revoked_at, _agora()),
        sessoes=total.get(p.id, 0),
        ultima_sessao=ultima.get(p.id),
    )


def _plano_do_token(db, token: str | None, *, graca: timedelta = timedelta(0)) -> HomePracticePlan:
    if not token or len(token) > 128:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Link de prática inválido")
    plano = db.scalar(select(HomePracticePlan).where(HomePracticePlan.token_hash == hash_token(token)))
    if plano is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link de prática não encontrado")
    # revogado é na hora; expirado ainda aceita envio durante a carência
    if not plano_ativo(plano.expires_at + graca, plano.revoked_at, _agora()):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Este link de prática não está mais ativo")
    return plano


@router.get("/plano", response_model=PlanoPublico)
def ler_plano(
    request: Request,
    db: DbSession,
    x_pratica_token: str | None = Header(default=None),
) -> PlanoPublico:
    enforce_rate_limit(request, bucket="pratica_plano", limit=60, window_sec=60)
    plano = _plano_do_token(db, x_pratica_token)
    return PlanoPublico(saudacao=plano.greeting or "", exercicios=plano.exercises, expira_em=plano.expires_at)


@router.post("/sessoes", response_model=SincronizacaoOut)
def enviar_sessoes(
    entrada: SessoesEntrada,
    request: Request,
    db: DbSession,
    x_pratica_token: str | None = Header(default=None),
) -> SincronizacaoOut:
    """Recebe a fila do celular. Idempotente: a mesma sessão (mesmo id) só é gravada uma vez."""
    enforce_rate_limit(request, bucket="pratica_sessoes", limit=30, window_sec=60)
    plano = _plano_do_token(db, x_pratica_token, graca=GRACA_ENVIO)
    agora = _agora()

    ids = [s.id for s in entrada.sessoes]
    ja = set(
        db.scalars(
            select(ClinicalEvaluation.client_ref).where(
                ClinicalEvaluation.owner_id == plano.owner_id, ClinicalEvaluation.client_ref.in_(ids)
            )
        )
    )
    recebidas: list[str] = []
    recusadas: list[SessaoRecusada] = []
    total_plano = _contar(db, plano.id)
    por_dia: dict[str, int] = {}
    for s in entrada.sessoes:
        if s.id in ja or s.id in recebidas:
            recebidas.append(s.id)
            continue
        try:
            if s.exercicio >= len(plano.exercises):
                raise ErroSessao("exercício que não está no plano")
            ex = plano.exercises[s.exercicio]
            feito = conferir_data(s.feito_em, plano.created_at, plano.expires_at, agora)
            reps = [r.model_dump() for r in s.repeticoes]
            resumo = resumir_sessao(ex, reps)
            if total_plano >= MAX_SESSOES_PLANO:
                raise ErroSessao(f"limite de {MAX_SESSOES_PLANO} sessões deste link atingido")
            dia = feito.date().isoformat()
            if dia not in por_dia:
                inicio = datetime(feito.year, feito.month, feito.day, tzinfo=timezone.utc)
                por_dia[dia] = _contar(db, plano.id, inicio, inicio + timedelta(days=1))
            if por_dia[dia] >= MAX_SESSOES_DIA:
                raise ErroSessao(f"limite de {MAX_SESSOES_DIA} sessões por dia atingido")
        except ErroSessao as exc:
            recusadas.append(SessaoRecusada(id=s.id, motivo=str(exc)))
            continue
        resultado = {
            "plano_id": plano.id,
            "exercicio": s.exercicio,
            "tipo": ex["tipo"],
            "titulo": ex["titulo"],
            "faixa_hz": ex.get("faixa_hz"),
            "faixa_db": ex.get("faixa_db"),
            "repeticoes": reps,
            "resumo": resumo,
            "feito_em": feito.isoformat(),
            "fonte": "celular",
        }
        db.add(
            ClinicalEvaluation(
                owner_id=plano.owner_id, patient_name=plano.patient_name, kind=TIPO,
                result=resultado, client_ref=s.id, practice_plan_id=plano.id, created_at=feito,
            )
        )
        try:
            db.commit()
        except IntegrityError:
            # esperado: a mesma sessão chegou em duas requisições ao mesmo tempo. Só conta como
            # recebida se estiver mesmo gravada; senão o erro sobe (500) e o celular tenta de novo.
            db.rollback()
            gravada = db.scalar(
                select(ClinicalEvaluation.id).where(
                    ClinicalEvaluation.owner_id == plano.owner_id, ClinicalEvaluation.client_ref == s.id
                )
            )
            if gravada is None:
                raise
        else:
            total_plano += 1
            por_dia[dia] += 1
        recebidas.append(s.id)
    if recusadas:
        logger.info("pratica: %d sessões recusadas no plano %s", len(recusadas), plano.id)
    return SincronizacaoOut(recebidas=recebidas, recusadas=recusadas)
