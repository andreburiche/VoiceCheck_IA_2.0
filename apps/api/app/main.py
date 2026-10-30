from collections.abc import Sequence
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
import hmac

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.metrics import metrics_payload
from app.core.security import hash_password
from app.core.security_headers import SecurityHeadersMiddleware
from app.models import Plan, ProcessingModel, Subscription, User
from app.models.entities import SubscriptionStatus, UserRole

logger = structlog.get_logger()
settings = get_settings()

# Contas de teste (seed só com APP_ENV em development/dev/local/test). Senha única documentada na UI de login.
_DEV_TEST_USERS = (
    {
        "email": "admin@estudio.local",
        "name": "Admin Teste",
        "role": UserRole.admin,
        "password": "senha12345",
    },
    {
        "email": "musico@estudio.local",
        "name": "Músico Teste",
        "role": UserRole.user,
        "password": "senha12345",
    },
    {
        "email": "andre@estudio.local",
        "name": "André Silva",
        "role": UserRole.user,
        "password": "senha12345",
    },
)


def seed_reference_data() -> None:
    db = SessionLocal()
    try:
        free = db.scalar(select(Plan).where(Plan.code == "free"))
        if not free:
            free = Plan(
                code="free",
                name="Gratuito",
                max_minutes_month=settings.default_max_minutes_month,
                max_storage_mb=settings.default_max_storage_mb,
                max_concurrent_jobs=settings.default_max_concurrent_jobs,
                features={"stems": 4, "export_wav": True},
                price_cents=0,
                active=True,
            )
            db.add(free)
            db.flush()
        elif not settings.is_production:
            # Dev/local: re-sincroniza cotas do .env (evita 512 MB legado travar stems)
            free.max_minutes_month = settings.default_max_minutes_month
            free.max_storage_mb = settings.default_max_storage_mb
            free.max_concurrent_jobs = settings.default_max_concurrent_jobs
            free.active = True
        model = db.scalar(select(ProcessingModel).where(ProcessingModel.code == "htdemucs"))
        if not model:
            db.add(
                ProcessingModel(
                    code="htdemucs",
                    name="Demucs HTDemucs 4 stems",
                    version="4.0.1",
                    stem_layout=["vocals", "drums", "bass", "other"],
                    license="MIT",
                    is_enabled=True,
                    min_vram_mb=4096,
                    params_schema={"overlap": {"type": "number", "default": 0.25}},
                )
            )
        model_two = db.scalar(select(ProcessingModel).where(ProcessingModel.code == "htdemucs_two"))
        if not model_two:
            db.add(
                ProcessingModel(
                    code="htdemucs_two",
                    name="Vocal / Instrumental (2 stems)",
                    version="4.0.1+sum",
                    stem_layout=["vocals", "instrumental"],
                    license="MIT",
                    is_enabled=True,
                    min_vram_mb=4096,
                    params_schema={
                        "method": {
                            "type": "string",
                            "const": "htdemucs_sum",
                            "description": "Demucs 4-stem + soma drums+bass+other",
                        }
                    },
                )
            )

        if settings.seed_dev_users:
            for entry in _DEV_TEST_USERS:
                existing = db.scalar(select(User).where(User.email == entry["email"]))
                if existing and existing.deleted_at is None:
                    # Garante role correta (admin pode ter sido criado como user antes)
                    if existing.role != entry["role"]:
                        existing.role = entry["role"]
                    continue
                user = User(
                    email=entry["email"],
                    name=entry["name"],
                    password_hash=hash_password(entry["password"]),
                    role=entry["role"],
                )
                db.add(user)
                db.flush()
                now = datetime.now(UTC)
                db.add(
                    Subscription(
                        user_id=user.id,
                        plan_id=free.id,
                        status=SubscriptionStatus.active,
                        current_period_start=now,
                        current_period_end=now + timedelta(days=30),
                    )
                )

        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )
    if settings.seed_dev_users:
        # Dev: o --reload recarrega o código sem rodar o "alembic upgrade" do start do
        # container; aplica migrações novas aqui para o modelo e o banco não divergirem.
        try:
            from alembic import command
            from alembic.config import Config

            cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
            cfg.attributes["configure_logger"] = False
            command.upgrade(cfg, "head")
            logger.info("dev_migrations_ok")
        except Exception as exc:  # noqa: BLE001
            logger.warning("dev_migrations_skipped", error=str(exc))
    try:
        seed_reference_data()
        logger.info("seed_ok", at=datetime.now(UTC).isoformat())
    except Exception as exc:  # noqa: BLE001 — bootstrap: DB pode ainda não estar pronto no reload
        logger.warning("seed_skipped", error=str(exc))
    yield


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    lifespan=lifespan,
    # Documentação interativa só fora de produção.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*", "X-CSRF-Token", "Idempotency-Key"],
    # O autotune devolve as estatísticas num cabeçalho; o navegador precisa poder lê-lo.
    expose_headers=["X-Autotune-Stats"],
)

app.include_router(api_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}


@app.get("/metrics", include_in_schema=False)
def metrics(request: Request) -> Response:
    token = settings.metrics_token
    if token:
        auth = request.headers.get("authorization", "")
        if not hmac.compare_digest(auth, f"Bearer {token}"):
            raise HTTPException(status_code=401, detail="Token de métricas inválido")
    elif settings.is_production:
        raise HTTPException(status_code=404, detail="Not Found")
    body, content_type = metrics_payload()
    return Response(content=body, media_type=content_type)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if isinstance(detail, dict):
        code = detail.get("code", "http_error")
        message = detail.get("message", str(detail))
        details = detail.get("details")
    else:
        code = "http_error"
        message = str(detail)
        details = None
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": code, "message": message, "details": details},
    )


def _erros_serializaveis(erros: Sequence[Any]) -> list[Any]:
    """No pydantic 2, o "ctx" de um erro de validador traz o próprio ValueError, que não
    vira JSON: a resposta 422 virava 500. Converte o que não for simples em texto."""
    saida = []
    for erro in erros:
        erro = dict(erro)
        ctx = erro.get("ctx")
        if isinstance(ctx, dict):
            erro["ctx"] = {k: v if isinstance(v, (str, int, float, bool, type(None))) else str(v) for k, v in ctx.items()}
        saida.append(erro)
    return jsonable_encoder(saida)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"code": "validation_error", "message": "Dados inválidos", "details": _erros_serializaveis(exc.errors())},
    )
