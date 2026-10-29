from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class UsageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    plan_code: str
    plan_name: str
    period_ym: str
    minutes_used: Decimal
    max_minutes_month: int
    storage_bytes_used: int
    max_storage_mb: int
    concurrent_jobs: int
    max_concurrent_jobs: int
    features: dict
