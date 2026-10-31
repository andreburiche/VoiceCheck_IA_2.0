from datetime import UTC
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import is_valid_csrf_token, safe_decode_access_token
from app.models import User
from app.models.entities import UserRole

DbSession = Annotated[Session, Depends(get_db)]

ACCESS_COOKIE = "em_access"
CSRF_COOKIE = "em_csrf"
CSRF_HEADER = "X-CSRF-Token"


def get_current_user(
    db: DbSession,
    em_access: Annotated[str | None, Cookie(alias=ACCESS_COOKIE)] = None,
) -> User:
    if not em_access:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    payload = safe_decode_access_token(em_access)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida")

    user = db.get(User, payload["sub"])
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")
    changed = user.password_changed_at
    if changed is not None:
        changed_ts = (changed if changed.tzinfo else changed.replace(tzinfo=UTC)).timestamp()
        # gravado em segundos inteiros (sem fração: o MySQL arredondaria para o segundo seguinte e
        # derrubaria a sessão nova emitida logo depois); sessões emitidas antes desse segundo caem
        if float(payload.get("iat", 0)) < changed_ts:
            # Senha trocada (ou "sair de todos os aparelhos") depois que esta sessão foi criada
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
    return user


AdminUser = Annotated[User, Depends(require_admin)]

#: Perfis que acessam a avaliação clínica (dados de saúde de pacientes).
PERFIS_CLINICOS = {"fonoaudiologo"}


def require_clinico(user: CurrentUser) -> User:
    """Avaliação clínica: só administrador ou fonoaudiólogo com o registro (CRFa) aprovado.

    Declarar o perfil não basta: músico, professor de música ou quem só escolheu "fonoaudiólogo" e
    ainda não teve o registro conferido fica de fora (dados de saúde de pacientes, LGPD art. 11)."""
    if user.clinical_access:
        return user
    if (user.profile_kind or "") in PERFIS_CLINICOS and user.clinical_status == "pendente":
        detalhe = "Seu registro no conselho (CRFa) está em conferência. A avaliação clínica abre assim que for aprovado."
    elif (user.profile_kind or "") in PERFIS_CLINICOS and user.clinical_status == "recusado":
        detalhe = "O registro informado não foi aprovado. Confira o número do CRFa em Meu perfil e salve para pedir nova conferência."
    else:
        detalhe = "A avaliação clínica é só para fonoaudiólogos com registro aprovado: escolha esse perfil em Meu perfil e informe o CRFa."
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detalhe)


def require_clinico_registrado(request: Request, db: DbSession, user: Annotated[User, Depends(require_clinico)]) -> User:
    """Como require_clinico, e registra o acesso no log de auditoria (LGPD art. 37)."""
    from app.services.voz_clinica.acesso import registrar_acesso

    registrar_acesso(request, db, user.id)
    return user


def verify_csrf(
    request: Request,
    em_csrf: Annotated[str | None, Cookie(alias=CSRF_COOKIE)] = None,
) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    header = request.headers.get(CSRF_HEADER)
    if not em_csrf or not header or em_csrf != header:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF inválido")
    if not is_valid_csrf_token(em_csrf):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF inválido")
