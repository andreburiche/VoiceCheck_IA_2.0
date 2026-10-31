from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.core.deps import AdminUser, DbSession
from app.models import AuditLog, ProcessingJob, User
from app.models.entities import JobStatus
from app.schemas.admin import (
    AdminAuditItem,
    AdminAuditListResponse,
    AdminJobItem,
    AdminJobListResponse,
    AdminUserItem,
    AdminUserListResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    _admin: AdminUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AdminUserListResponse:
    base = select(User).where(User.deleted_at.is_(None))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(User.created_at.desc()).limit(limit).offset(offset)).all()
    return AdminUserListResponse(
        items=[
            AdminUserItem(
                id=u.id,
                email=u.email,
                name=u.name,
                role=u.role.value,
                created_at=u.created_at,
                deleted_at=u.deleted_at,
            )
            for u in rows
        ],
        total=total,
    )


@router.get("/jobs", response_model=AdminJobListResponse)
def list_jobs(
    _admin: AdminUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
) -> AdminJobListResponse:
    base = select(ProcessingJob)
    if status:
        try:
            base = base.where(ProcessingJob.status == JobStatus(status))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Status inválido") from exc
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(ProcessingJob.created_at.desc()).limit(limit).offset(offset)).all()
    return AdminJobListResponse(
        items=[
            AdminJobItem(
                id=j.id,
                owner_id=j.owner_id,
                project_id=j.project_id,
                status=j.status.value,
                progress=float(j.progress),
                model_version=j.model_version,
                error_code=j.error_code,
                created_at=j.created_at,
                finished_at=j.finished_at,
            )
            for j in rows
        ],
        total=total,
    )


@router.get("/audit-logs", response_model=AdminAuditListResponse)
def list_audit(
    _admin: AdminUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AdminAuditListResponse:
    base = select(AuditLog)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(base.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)).all()
    return AdminAuditListResponse(
        items=[AdminAuditItem.model_validate(r) for r in rows],
        total=total,
    )


@router.get("/conformidade")
def conformidade(_admin: AdminUser, db: DbSession) -> dict:
    """Métricas de segurança e LGPD calculadas no próprio banco (painel do administrador).

    Só contagens: nenhum nome de paciente sai daqui.
    """
    from datetime import UTC, datetime, timedelta

    from app.models import ClinicalEvaluation, HomePracticePlan, StoragePendingDelete, VoicePatient

    agora = datetime.now(UTC)
    d7, d30, d90 = agora - timedelta(days=7), agora - timedelta(days=30), agora - timedelta(days=90)
    anos5 = agora - timedelta(days=5 * 365)

    def contar(*filtros, modelo=AuditLog) -> int:
        return int(db.scalar(select(func.count()).select_from(modelo).where(*filtros)) or 0)

    clinicos = select(User).where(User.deleted_at.is_(None), User.profile_kind == "fonoaudiologo").subquery()
    total_clinicos = int(db.scalar(select(func.count()).select_from(clinicos)) or 0)
    sem_verificar = int(db.scalar(select(func.count()).select_from(clinicos).where(clinicos.c.email_verified_at.is_(None))) or 0)
    usuarios = contar(User.deleted_at.is_(None), modelo=User)
    sem_aceite = contar(User.deleted_at.is_(None), User.privacy_accepted_at.is_(None), modelo=User)

    # pacientes cujo último registro tem mais de 5 anos (revisar o prazo de guarda do prontuário)
    ultimos = (
        select(ClinicalEvaluation.owner_id, ClinicalEvaluation.patient_name, func.max(ClinicalEvaluation.created_at).label("u"))
        .group_by(ClinicalEvaluation.owner_id, ClinicalEvaluation.patient_name)
        .subquery()
    )
    antigos = int(db.scalar(select(func.count()).select_from(ultimos).where(ultimos.c.u < anos5)) or 0)
    pacientes = int(db.scalar(select(func.count()).select_from(ultimos)) or 0)
    pendente_mais_antigo = db.scalar(select(func.min(StoragePendingDelete.created_at)))

    return {
        "gerado_em": agora.isoformat(),
        "acesso": {
            "logins_com_falha_7d": contar(AuditLog.action == "auth.login_failed", AuditLog.created_at >= d7),
            "acessos_clinicos_registrados_7d": contar(AuditLog.action == "voz_clinica.acesso", AuditLog.created_at >= d7),
            "exportacoes_de_paciente_30d": contar(AuditLog.action == "voz_clinica.paciente_exportado", AuditLog.created_at >= d30),
            "exclusoes_de_paciente_30d": contar(AuditLog.action == "voz_clinica.paciente_excluido", AuditLog.created_at >= d30),
        },
        "contas": {
            "usuarios": usuarios,
            "sem_aceite_da_politica": sem_aceite,
            "fonoaudiologos": total_clinicos,
            "fonoaudiologos_sem_email_verificado": sem_verificar,
        },
        "dados_de_pacientes": {
            "pacientes_com_registros": pacientes,
            "cadastros": contar(modelo=VoicePatient),
            "sem_registro_ha_mais_de_5_anos": antigos,
            "links_de_pratica_ativos": contar(HomePracticePlan.revoked_at.is_(None), HomePracticePlan.expires_at > agora,
                                              modelo=HomePracticePlan),
            "links_de_pratica_ativos_ha_mais_de_90_dias": contar(
                HomePracticePlan.revoked_at.is_(None), HomePracticePlan.expires_at > agora, HomePracticePlan.created_at < d90,
                modelo=HomePracticePlan),
            "arquivos_aguardando_exclusao": contar(modelo=StoragePendingDelete),
            "exclusao_pendente_mais_antiga": pendente_mais_antigo.isoformat() if pendente_mais_antigo else None,
        },
    }
