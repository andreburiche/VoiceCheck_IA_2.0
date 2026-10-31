import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status

from app.api.v1.voicecheck import _read_limited
from app.core.deps import CurrentUser, DbSession, verify_csrf
from app.core.rate_limit import enforce_rate_limit
from app.schemas.auth import PerfilEntrada, UserResponse
from app.schemas.billing import UsageResponse
from app.services.quotas import get_usage_snapshot
from app.services.storage import get_storage
from app.services.voz_clinica import midias

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)

LIMITE_FOTO = 5 * 1024 * 1024
CAMPOS_PERFIL = ("registro", "especialidade", "instituicao", "telefone", "endereco", "cidade", "apresentacao")
MIME_POR_EXT = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.put("/me/perfil", response_model=UserResponse, dependencies=[Depends(verify_csrf)])
def atualizar_perfil(entrada: PerfilEntrada, user: CurrentUser, db: DbSession) -> UserResponse:
    """Meu perfil: nome, perfil profissional e dados que entram nos documentos e relatórios.

    O perfil é declarado pelo profissional, mas o de fonoaudiólogo só libera a avaliação clínica depois
    que o administrador confere o registro (CRFa). Trocar de perfil tira o acesso; voltar para
    fonoaudiólogo, ou mudar o número do registro, pede nova conferência."""
    registro_antes = (user.profile_data or {}).get("registro")
    era_fono = user.profile_kind == "fonoaudiologo"
    user.name = entrada.name.strip()
    user.profile_kind = entrada.perfil
    dados = {k: (getattr(entrada, k) or "").strip() or None for k in CAMPOS_PERFIL}
    user.profile_data = {k: v for k, v in dados.items() if v} or None
    if entrada.perfil != "fonoaudiologo":
        user.clinical_status = None
    elif not era_fono or dados.get("registro") != registro_antes or user.clinical_status in (None, "recusado"):
        user.clinical_status = "pendente"
        user.clinical_review_note = None
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/me/aceite-privacidade", response_model=UserResponse, dependencies=[Depends(verify_csrf)])
def aceitar_privacidade(request: Request, user: CurrentUser, db: DbSession) -> UserResponse:
    """Registra o aceite da versão atual dos Termos e da Política de Privacidade (LGPD art. 8º e 9º)."""
    from datetime import UTC, datetime

    from app.api.v1.auth import VERSAO_PRIVACIDADE
    from app.services.audit import write_audit

    user.privacy_accepted_at = datetime.now(UTC)
    user.privacy_version = VERSAO_PRIVACIDADE
    write_audit(db, action="auth.aceite_privacidade", resource_type="user", resource_id=user.id, actor_id=user.id,
                request=request, meta={"versao": VERSAO_PRIVACIDADE})
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/me/foto", response_model=UserResponse, dependencies=[Depends(verify_csrf)])
async def enviar_foto(request: Request, user: CurrentUser, db: DbSession, file: UploadFile = File(...)) -> UserResponse:
    """Foto do profissional (JPG, PNG ou WebP, até 5 MB). Substitui a anterior."""
    enforce_rate_limit(request, bucket="perfil_foto", limit=20, window_sec=600)
    dados = await _read_limited(file, max_bytes=LIMITE_FOTO)
    try:
        categoria, mime, ext = midias.validar(dados)
    except midias.ErroMidia as exc:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(exc)) from exc
    if categoria != "imagem":
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Envie uma imagem (JPG, PNG ou WebP).")
    chave = f"perfil/{user.id}/{uuid.uuid4()}.{ext}"
    await asyncio.to_thread(get_storage().put_bytes, chave, dados, mime)
    anterior = user.photo_key
    user.photo_key = chave
    db.commit()
    db.refresh(user)
    if anterior:
        try:
            await asyncio.to_thread(get_storage().delete, anterior)
        except Exception:  # noqa: BLE001 — sobra no storage, não afeta o usuário
            logger.warning("perfil: foto antiga não apagada")
    return UserResponse.model_validate(user)


@router.get("/me/foto")
def ver_foto(user: CurrentUser) -> Response:
    if not user.photo_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sem foto")
    try:
        dados = get_storage().get_bytes(user.photo_key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto não encontrada") from exc
    ext = user.photo_key.rsplit(".", 1)[-1]
    return Response(dados, media_type=MIME_POR_EXT.get(ext, "application/octet-stream"), headers={
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    })


@router.delete("/me/foto", response_model=UserResponse, dependencies=[Depends(verify_csrf)])
def apagar_foto(user: CurrentUser, db: DbSession) -> UserResponse:
    anterior = user.photo_key
    user.photo_key = None
    db.commit()
    db.refresh(user)
    if anterior:
        try:
            get_storage().delete(anterior)
        except Exception:  # noqa: BLE001
            logger.warning("perfil: foto não apagada do storage")
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
