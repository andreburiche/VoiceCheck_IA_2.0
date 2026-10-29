from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.schemas.auth import UserResponse
from app.schemas.billing import UsageResponse
from app.services.quotas import get_usage_snapshot

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.get("/me/usage", response_model=UsageResponse)
def my_usage(user: CurrentUser, db: DbSession) -> UsageResponse:
    snap = get_usage_snapshot(db, user.id)
    return UsageResponse(
        plan_code=snap.plan.code,
        plan_name=snap.plan.name,
        period_ym=snap.period_ym,
        minutes_used=snap.minutes_used,
        max_minutes_month=snap.plan.max_minutes_month,
        storage_bytes_used=snap.storage_bytes_used,
        max_storage_mb=snap.plan.max_storage_mb,
        concurrent_jobs=snap.concurrent_jobs,
        max_concurrent_jobs=snap.plan.max_concurrent_jobs,
        features=snap.plan.features or {},
    )
