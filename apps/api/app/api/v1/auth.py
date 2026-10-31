import hashlib
import html
import logging
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select

from app.core import metrics as app_metrics
from app.core.config import get_settings
from app.core.deps import ACCESS_COOKIE, CSRF_COOKIE, CurrentUser, DbSession, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.core.security import create_access_token, generate_csrf_token, hash_password, verify_password
from app.models import PasswordResetToken, Plan, Subscription, User
from app.models.entities import SubscriptionStatus, UserRole
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
)
from app.services.audit import write_audit
from app.services.mailer import mail_configured, send_mail

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
#: Versão da Política de Privacidade em vigor (muda quando o texto da página /privacidade mudar).
VERSAO_PRIVACIDADE = "2026-10-31"
settings = get_settings()


def _auth_rate_limit(request: Request) -> None:
    enforce_rate_limit(
        request,
        bucket="auth",
        limit=settings.rate_limit_auth,
        window_sec=settings.rate_limit_auth_window_sec,
    )


def _set_auth_cookies(response: Response, *, access_token: str, csrf_token: str) -> None:
    max_age = settings.jwt_access_token_expire_minutes * 60
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE,
        value=csrf_token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


def _ensure_default_subscription(db: DbSession, user: User) -> None:
    plan = db.scalar(select(Plan).where(Plan.code == settings.default_plan_code, Plan.active.is_(True)))
    if not plan:
        return
    now = datetime.now(UTC)
    sub = Subscription(
        user_id=user.id,
        plan_id=plan.id,
        status=SubscriptionStatus.active,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
    )
    db.add(sub)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: DbSession, request: Request) -> AuthResponse:
    _auth_rate_limit(request)
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing and existing.deleted_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        name=payload.name.strip(),
        role=UserRole.user,
        profile_kind=payload.perfil,
        profile_data={"registro": payload.registro.strip()} if payload.registro and payload.registro.strip() else None,
        # fonoaudiólogo só entra na área clínica depois que o administrador confere o CRFa
        clinical_status="pendente" if payload.perfil == "fonoaudiologo" else None,
        privacy_accepted_at=datetime.now(UTC) if payload.aceite_privacidade else None,
        privacy_version=VERSAO_PRIVACIDADE if payload.aceite_privacidade else None,
    )
    db.add(user)
    db.flush()
    _ensure_default_subscription(db, user)
    write_audit(
        db,
        action="auth.register",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        request=request,
        meta={"email": user.email, "aceite_privacidade": user.privacy_version},
    )
    db.commit()
    db.refresh(user)
    app_metrics.AUTH_REGISTERED.inc()

    token = create_access_token(subject=user.id, extra={"role": user.role.value})
    csrf = generate_csrf_token()
    _set_auth_cookies(response, access_token=token, csrf_token=csrf)
    return AuthResponse(user=UserResponse.model_validate(user), csrf_token=csrf)


#: Hash bcrypt de uma senha aleatória: conferido quando o e-mail não existe, para o login levar o
#: mesmo tempo com ou sem conta (sem isso, a demora revela quais e-mails estão cadastrados).
_HASH_FICTICIO = hash_password(secrets.token_urlsafe(24))


def _chave_conta(email: str) -> str:
    return hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:32]


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, response: Response, db: DbSession, request: Request) -> AuthResponse:
    _auth_rate_limit(request)
    # por conta, de qualquer IP: 10 tentativas a cada 15 min (segura ataque distribuído a uma conta)
    enforce_rate_limit(request, bucket="login_conta", limit=settings.rate_limit_login_conta, window_sec=900,
                       chave=_chave_conta(payload.email))
    user = db.scalar(select(User).where(User.email == payload.email.lower(), User.deleted_at.is_(None)))
    senha_ok = verify_password(payload.password, user.password_hash if user else _HASH_FICTICIO)
    if not user or not senha_ok:
        app_metrics.AUTH_LOGIN_FAILED.inc()
        write_audit(
            db,
            action="auth.login_failed",
            resource_type="user",
            resource_id=None,
            actor_id=None,
            request=request,
            meta={"email": payload.email.lower()},
            commit=True,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    token = create_access_token(subject=user.id, extra={"role": user.role.value})
    csrf = generate_csrf_token()
    _set_auth_cookies(response, access_token=token, csrf_token=csrf)
    return AuthResponse(user=UserResponse.model_validate(user), csrf_token=csrf)


@router.post("/logout", response_model=MessageResponse, dependencies=[Depends(verify_csrf)])
def logout(response: Response) -> MessageResponse:
    _clear_auth_cookies(response)
    return MessageResponse(message="Sessão encerrada")


# ---------------------------------------------------------------------------
# Esqueci minha senha
# ---------------------------------------------------------------------------

FORGOT_MESSAGE = (
    "Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha. "
    "Confira também a caixa de spam."
)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


@router.post("/password/forgot", response_model=ForgotPasswordResponse, status_code=status.HTTP_202_ACCEPTED)
def forgot_password(payload: ForgotPasswordRequest, db: DbSession, request: Request) -> ForgotPasswordResponse:
    """Sempre responde igual — não revela se o e-mail tem conta."""
    _auth_rate_limit(request)
    user = db.scalar(select(User).where(User.email == payload.email, User.deleted_at.is_(None)))
    if user is None:
        return ForgotPasswordResponse(message=FORGOT_MESSAGE)

    now = datetime.now(UTC)
    # Invalida links anteriores ainda não usados
    for old in db.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)
        )
    ):
        old.used_at = now
    token = secrets.token_urlsafe(32)
    ip = request.client.host if request.client else None
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_token_hash(token),
            expires_at=now + timedelta(minutes=settings.password_reset_ttl_minutes),
            requested_ip=(ip or "")[:64] or None,
        )
    )
    write_audit(db, action="auth.password_forgot", resource_type="user", resource_id=user.id, request=request)
    db.commit()

    link = f"{settings.public_web_url.rstrip('/')}/redefinir-senha?token={quote(token)}"
    minutes = settings.password_reset_ttl_minutes
    sent = send_mail(
        to=user.email,
        subject="Crie uma nova senha — VoiceCheck IA",
        text=(
            f"Olá, {user.name}!\n\n"
            f"Recebemos um pedido para criar uma nova senha. Abra o link abaixo (vale por {minutes} minutos):\n\n"
            f"{link}\n\n"
            "Se não foi você, ignore este e-mail — sua senha continua a mesma."
        ),
        html=(
            f"<p>Olá, {html.escape(user.name)}!</p>"
            f"<p>Recebemos um pedido para criar uma nova senha. O link vale por {minutes} minutos.</p>"
            f'<p><a href="{link}" style="background:#20D9D2;color:#071018;padding:12px 20px;'
            'border-radius:999px;text-decoration:none;font-weight:600">Criar nova senha</a></p>'
            "<p>Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>"
        ),
    )
    dev_url = None
    if not sent:
        if settings.seed_dev_users:
            logger.warning("Redefinição de senha (dev, sem SMTP) para a conta %s: %s", user.id, link)
            dev_url = link
        else:
            logger.error("SMTP não configurado: link de redefinição não enviado (conta %s)", user.id)
    return ForgotPasswordResponse(message=FORGOT_MESSAGE, dev_reset_url=dev_url)


@router.post("/password/reset", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: DbSession, request: Request) -> MessageResponse:
    _auth_rate_limit(request)
    row = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == _token_hash(payload.token)))
    now = datetime.now(UTC)
    if row is None or row.used_at is not None or _aware(row.expires_at) < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.",
        )
    user = db.get(User, row.user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Conta não encontrada.")
    user.password_hash = hash_password(payload.password)
    user.password_changed_at = now  # encerra sessões abertas com a senha antiga
    row.used_at = now
    write_audit(db, action="auth.password_reset", resource_type="user", resource_id=user.id, actor_id=user.id, request=request)
    db.commit()
    return MessageResponse(message="Senha alterada. Entre com a nova senha.")
