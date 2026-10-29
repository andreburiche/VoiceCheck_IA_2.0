from datetime import datetime
from typing import Annotated, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def _normalize_email(value: str) -> str:
    email = (value or "").strip().lower()
    if "@" not in email or "." not in email.split("@", 1)[-1]:
        raise ValueError("e-mail inválido")
    local, domain = email.rsplit("@", 1)
    if not local or not domain or " " in email:
        raise ValueError("e-mail inválido")
    return email


# Aceita domínios de desenvolvimento (.local) rejeitados pelo EmailStr/RFC.
AppEmail = Annotated[str, AfterValidator(_normalize_email)]


class RegisterRequest(BaseModel):
    email: AppEmail
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=120)


class LoginRequest(BaseModel):
    email: AppEmail
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: AppEmail


class ForgotPasswordResponse(BaseModel):
    message: str
    #: Só em desenvolvimento e sem SMTP: link para testar o fluxo.
    dev_reset_url: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: AppEmail
    name: str
    role: str
    email_verified_at: Optional[datetime] = None
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserResponse
    csrf_token: str


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: dict | list | None = None
