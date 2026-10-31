from datetime import datetime
import re
from typing import Annotated, Any, Literal, Optional

from pydantic import AfterValidator, AliasChoices, BaseModel, ConfigDict, Field, model_validator

#: fonoaudiologo (acessa a avaliação clínica) | professor_musica | musico
PerfilProfissional = Literal["fonoaudiologo", "professor_musica", "musico"]


def _registro_valido(registro: Optional[str]) -> bool:
    """Registro do conselho (ex.: "CRFa 2-12345"): precisa ter número."""
    return bool(registro and re.search(r"\d", registro))


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
    perfil: Optional[PerfilProfissional] = None
    #: obrigatório para fonoaudiólogo (número do CRFa)
    registro: Optional[str] = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def _fono_com_registro(self) -> "RegisterRequest":
        if self.perfil == "fonoaudiologo" and not _registro_valido(self.registro):
            raise ValueError("Informe o número do registro no conselho (CRFa) para o perfil de fonoaudiólogo")
        return self


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
    perfil: Optional[str] = Field(default=None, validation_alias=AliasChoices("perfil", "profile_kind"))
    perfil_dados: Optional[dict[str, Any]] = Field(default=None, validation_alias=AliasChoices("perfil_dados", "profile_data"))
    tem_foto: bool = Field(default=False, validation_alias=AliasChoices("tem_foto", "has_photo"))
    #: pode abrir a avaliação clínica (fonoaudiólogo ou administrador)
    acesso_clinico: bool = Field(default=False, validation_alias=AliasChoices("acesso_clinico", "clinical_access"))


class PerfilEntrada(BaseModel):
    """Meu perfil: dados do profissional, usados nos documentos clínicos e nos relatórios de música."""

    name: str = Field(min_length=2, max_length=120)
    perfil: Optional[PerfilProfissional] = None
    registro: Optional[str] = Field(default=None, max_length=60)
    especialidade: Optional[str] = Field(default=None, max_length=120)
    instituicao: Optional[str] = Field(default=None, max_length=160)
    telefone: Optional[str] = Field(default=None, max_length=40)
    endereco: Optional[str] = Field(default=None, max_length=200)
    cidade: Optional[str] = Field(default=None, max_length=80)
    apresentacao: Optional[str] = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _fono_com_registro(self) -> "PerfilEntrada":
        if self.perfil == "fonoaudiologo" and not _registro_valido(self.registro):
            raise ValueError("Informe o número do registro no conselho (CRFa) para o perfil de fonoaudiólogo")
        return self


class AuthResponse(BaseModel):
    user: UserResponse
    csrf_token: str


class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: dict | list | None = None
