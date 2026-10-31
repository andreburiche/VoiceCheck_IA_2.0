"""Registro de acesso aos dados de pacientes (LGPD art. 37: registro das operações de tratamento).

Toda chamada à área clínica fica no log de auditoria: quem, quando, de onde (IP), o quê (método e
rota) e de qual paciente — por um rastro HMAC, nunca pelo nome (minimização, art. 6º, III). Com o
segredo do servidor dá para responder "quem acessou o prontuário de Fulano?" calculando o rastro.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import unicodedata
from urllib.parse import unquote

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.services.audit import write_audit

logger = logging.getLogger(__name__)

#: Rotas sem dado de paciente (status dos motores, se a IA está ligada): não entram no registro.
SEM_REGISTRO = {("GET", "/api/v1/voz-clinica/status"), ("GET", "/api/v1/voz-clinica/documentos/ia")}


def rastro_paciente(user_id: str, nome: str) -> str:
    """Identifica o paciente no log sem gravar o nome. HMAC: sem o segredo, não dá para testar nomes."""
    segredo = get_settings().jwt_secret.encode("utf-8")
    return hmac.new(segredo, f"{user_id}:{nome}".encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def _paciente_do_cabecalho(request: Request) -> str | None:
    bruto = request.headers.get("x-paciente") or request.query_params.get("paciente")
    if not bruto:
        return None
    try:
        nome = unquote(bruto, errors="strict")
    except UnicodeDecodeError:
        return None
    nome = unicodedata.normalize("NFC", " ".join(nome.split()))[:120]
    return nome or None


def registrar_acesso(request: Request, db: Session, user_id: str) -> None:
    rota = getattr(request.scope.get("route"), "path", None) or request.url.path
    if (request.method, rota) in SEM_REGISTRO:
        return
    meta: dict = {"metodo": request.method, "rota": rota}
    nome = _paciente_do_cabecalho(request)
    if nome:
        meta["paciente"] = rastro_paciente(user_id, nome)
    try:
        write_audit(db, action="voz_clinica.acesso", resource_type="voz_clinica", actor_id=user_id,
                    request=request, meta=meta, commit=True)
    except Exception:  # noqa: BLE001 — falha no log não derruba o atendimento, mas fica avisada
        db.rollback()
        logger.exception("Registro de acesso clínico não gravado")
