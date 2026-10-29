import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import jwt
from jwt.exceptions import InvalidTokenError

from app.core.config import get_settings
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(*, subject: str, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(UTC),
        "jti": str(uuid4()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def safe_decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        return decode_access_token(token)
    except InvalidTokenError:
        return None


def generate_csrf_token() -> str:
    """Token CSRF assinado com CSRF_SECRET (double-submit + integridade)."""
    nonce = secrets.token_urlsafe(18)
    sig = hmac.new(settings.csrf_secret.encode("utf-8"), nonce.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{nonce}.{sig}"


def is_valid_csrf_token(token: str) -> bool:
    if not token or "." not in token:
        return False
    nonce, _, sig = token.rpartition(".")
    if not nonce or not sig:
        return False
    expected = hmac.new(settings.csrf_secret.encode("utf-8"), nonce.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)
