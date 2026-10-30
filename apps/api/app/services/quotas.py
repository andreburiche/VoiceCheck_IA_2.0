"""Resolução de plano ativo e enforcement de cotas."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AudioAsset, ClinicalEvaluation, Plan, ProcessingJob, Subscription, UsageLedger, VoiceCheckDiagnosis
from app.models.entities import JobStatus, SubscriptionStatus, UsageKind


ACTIVE_JOB_STATUSES = (
    JobStatus.queued,
    JobStatus.preparing,
    JobStatus.processing,
    JobStatus.postprocessing,
)


class QuotaExceeded(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass
class PlanLimits:
    plan: Plan
    subscription: Subscription | None
    period_ym: str
    minutes_used: Decimal
    storage_bytes_used: int
    concurrent_jobs: int


def current_period_ym(now: datetime | None = None) -> str:
    dt = now or datetime.now(UTC)
    return f"{dt.year:04d}-{dt.month:02d}"


def get_active_plan(db: Session, user_id: str) -> tuple[Plan, Subscription | None]:
    sub = db.scalar(
        select(Subscription)
        .where(
            Subscription.user_id == user_id,
            Subscription.status == SubscriptionStatus.active,
        )
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    if sub:
        plan = db.get(Plan, sub.plan_id)
        if plan and plan.active:
            return plan, sub

    plan = db.scalar(select(Plan).where(Plan.code == "free", Plan.active.is_(True)))
    if not plan:
        raise RuntimeError("Plano free não configurado")
    return plan, sub


def minutes_used_in_period(db: Session, user_id: str, period_ym: str) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(UsageLedger.quantity), 0)).where(
            UsageLedger.user_id == user_id,
            UsageLedger.period_ym == period_ym,
            UsageLedger.kind == UsageKind.separation_minutes,
        )
    )
    return Decimal(str(total or 0))


def storage_bytes_used(db: Session, user_id: str) -> int:
    total = db.scalar(
        select(func.coalesce(func.sum(AudioAsset.size_bytes), 0)).where(
            AudioAsset.owner_id == user_id,
            AudioAsset.deleted_at.is_(None),
        )
    )
    # Áudios dos diagnósticos VoiceCheck salvos também contam na cota.
    vc_total = db.scalar(
        select(
            func.coalesce(
                func.sum(
                    VoiceCheckDiagnosis.original_size
                    + VoiceCheckDiagnosis.prepared_size
                    + VoiceCheckDiagnosis.corrected_size
                ),
                0,
            )
        ).where(VoiceCheckDiagnosis.owner_id == user_id)
    )
    # Gravações guardadas da avaliação clínica da voz (VoiceCheck IA 2.0).
    clin_total = db.scalar(
        select(func.coalesce(func.sum(ClinicalEvaluation.audio_bytes), 0)).where(
            ClinicalEvaluation.owner_id == user_id
        )
    )
    return int(total or 0) + int(vc_total or 0) + int(clin_total or 0)


def concurrent_jobs_count(db: Session, user_id: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(ProcessingJob)
            .where(
                ProcessingJob.owner_id == user_id,
                ProcessingJob.status.in_(ACTIVE_JOB_STATUSES),
            )
        )
        or 0
    )


def get_usage_snapshot(db: Session, user_id: str) -> PlanLimits:
    plan, sub = get_active_plan(db, user_id)
    period = current_period_ym()
    return PlanLimits(
        plan=plan,
        subscription=sub,
        period_ym=period,
        minutes_used=minutes_used_in_period(db, user_id, period),
        storage_bytes_used=storage_bytes_used(db, user_id),
        concurrent_jobs=concurrent_jobs_count(db, user_id),
    )


def assert_can_start_separation(db: Session, user_id: str, duration_ms: int | None) -> PlanLimits:
    snap = get_usage_snapshot(db, user_id)
    if snap.concurrent_jobs >= snap.plan.max_concurrent_jobs:
        raise QuotaExceeded(
            "QUOTA_CONCURRENT",
            f"Limite de jobs simultâneos atingido ({snap.plan.max_concurrent_jobs})",
        )

    needed = Decimal("0")
    if duration_ms and duration_ms > 0:
        needed = (Decimal(duration_ms) / Decimal(60_000)).quantize(Decimal("0.0001"))

    if snap.minutes_used + needed > Decimal(snap.plan.max_minutes_month):
        raise QuotaExceeded(
            "QUOTA_MINUTES",
            (
                f"Cota mensal de minutos esgotada "
                f"({snap.minutes_used}/{snap.plan.max_minutes_month} min no período {snap.period_ym})"
            ),
        )
    return snap


def assert_can_upload(db: Session, user_id: str, additional_bytes: int) -> PlanLimits:
    snap = get_usage_snapshot(db, user_id)
    limit_bytes = int(snap.plan.max_storage_mb) * 1024 * 1024
    if snap.storage_bytes_used + additional_bytes > limit_bytes:
        raise QuotaExceeded(
            "QUOTA_STORAGE",
            (
                f"Cota de armazenamento esgotada "
                f"({snap.storage_bytes_used // (1024 * 1024)}/{snap.plan.max_storage_mb} MB)"
            ),
        )
    return snap
