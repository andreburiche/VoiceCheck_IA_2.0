from collections.abc import Sequence
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import UTC, datetime, timedelta
from typing import Any

import logging

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


class _SemConsultaNoLogDeAcesso(logging.Filter):
    """Tira a query string das rotas da avaliação clínica do log de acesso do uvicorn:
    ?paciente=<nome> junto de /voz-clinica é dado de saúde (LGPD) e não deve ir para logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str) and "/voz-clinica" in args[2] and "?" in args[2]:
            record.args = (*args[:2], args[2].split("?", 1)[0] + "?…", *args[3:])
        return True


logging.getLogger("uvicorn.access").addFilter(_SemConsultaNoLogDeAcesso())
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
        "profile_kind": "musico",
    },
    {
        "email": "fono@estudio.local",
        "name": "Fonoaudióloga Teste",
        "role": UserRole.user,
        "password": "senha12345",
        "profile_kind": "fonoaudiologo",
        "profile_data": {"registro": "CRFa 0-00000 (conta de teste)"},
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
        # 6 instrumentos (guitarra e piano) e alta fidelidade (fine-tuned): mesmos pacotes do Demucs 4,
        # os pesos são baixados na primeira separação de cada um
        for code, name, version, layout in (
            ("htdemucs_6s", "Demucs HTDemucs 6 stems", "4.0.1", ["vocals", "drums", "bass", "guitar", "piano", "other"]),
            ("htdemucs_ft", "Demucs HTDemucs fine-tuned", "4.0.1", ["vocals", "drums", "bass", "other"]),
        ):
            if not db.scalar(select(ProcessingModel).where(ProcessingModel.code == code)):
                db.add(ProcessingModel(code=code, name=name, version=version, stem_layout=layout, license="MIT",
                                       is_enabled=True, min_vram_mb=4096,
                                       params_schema={"qualidade": {"type": "string", "enum": ["rapida", "equilibrada", "maxima"]}}))
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
                    # contas de teste: perfil fixo (a migração 0016 dá "fonoaudiologo" a quem tinha avaliações)
                    if existing.profile_kind != entry.get("profile_kind"):
                        existing.profile_kind = entry.get("profile_kind")
                        existing.profile_data = entry.get("profile_data") or existing.profile_data
                    # a conta de teste de fonoaudióloga já vem com o registro aprovado; as outras, sem acesso clínico
                    status_teste = "aprovado" if entry.get("profile_kind") == "fonoaudiologo" else None
                    if existing.clinical_status != status_teste:
                        existing.clinical_status = status_teste
                    continue
                user = User(
                    email=entry["email"],
                    name=entry["name"],
                    password_hash=hash_password(entry["password"]),
                    role=entry["role"],
                    profile_kind=entry.get("profile_kind"),
                    profile_data=entry.get("profile_data"),
                    clinical_status="aprovado" if entry.get("profile_kind") == "fonoaudiologo" else None,
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
    # gravações que o storage não apagou antes (rede, S3 fora do ar): nova tentativa ao iniciar
    try:
        from app.services.voz_clinica.exclusao import tentar_pendentes

        db = SessionLocal()
        try:
            apagadas, restantes = tentar_pendentes(db, limite=500)
            if apagadas or restantes:
                logger.info("exclusoes_pendentes", apagadas=apagadas, restantes=restantes)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        logger.warning("exclusoes_pendentes_skipped", error=str(exc))
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
