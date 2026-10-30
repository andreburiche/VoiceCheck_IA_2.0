"""Exclusão de gravações no storage com nova tentativa.

O banco é apagado primeiro (um registro apontando para arquivo apagado seria grave); se o
storage falhar depois (rede, S3 fora do ar), a chave fica em ``storage_pending_deletes`` e é
apagada numa próxima oportunidade: a cada nova exclusão e quando a API inicia. Pela LGPD, a
gravação de um paciente excluído não pode ficar esquecida no storage.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import StoragePendingDelete
from app.services.storage import get_storage

logger = logging.getLogger(__name__)


def _erro(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"[:255]


def _agendar(db: Session, chave: str, erro: str) -> None:
    pend = db.scalar(select(StoragePendingDelete).where(StoragePendingDelete.storage_key == chave))
    if pend is None:
        db.add(StoragePendingDelete(storage_key=chave, attempts=1, last_error=erro))
    else:
        pend.attempts += 1
        pend.last_error = erro


def apagar_ou_agendar(db: Session, chaves: list[str]) -> int:
    """Apaga as chaves no storage; as que falharem ficam agendadas. Devolve quantas ficaram pendentes.

    Nunca levanta exceção: chamada depois do commit da exclusão, que já valeu.
    """
    pendentes = 0
    storage = get_storage()
    for chave in chaves:
        if not chave:
            continue
        try:
            storage.delete(chave)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Voz clínica: gravação não apagada do storage, nova tentativa depois: %s", chave)
            try:
                _agendar(db, chave, _erro(exc))
                db.commit()
                pendentes += 1
            except Exception:  # noqa: BLE001 — sem banco também: fica no log, como antes
                db.rollback()
                logger.exception("Voz clínica: não foi possível agendar a nova tentativa de %s", chave)
    return pendentes


def tentar_pendentes(db: Session, limite: int = 50) -> tuple[int, int]:
    """Nova tentativa nas exclusões pendentes (as mais antigas primeiro). Devolve (apagadas, ainda pendentes)."""
    try:
        lista = db.scalars(
            select(StoragePendingDelete).order_by(StoragePendingDelete.updated_at).limit(limite)
        ).all()
    except Exception:  # noqa: BLE001 — tabela ainda não migrada, banco fora: tenta na próxima
        db.rollback()
        logger.warning("Voz clínica: exclusões pendentes não consultadas")
        return 0, 0
    if not lista:
        return 0, 0
    storage = get_storage()
    apagadas = 0
    for pend in lista:
        try:
            storage.delete(pend.storage_key)
        except Exception as exc:  # noqa: BLE001
            pend.attempts += 1
            pend.last_error = _erro(exc)
            continue
        db.delete(pend)
        apagadas += 1
    try:
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("Voz clínica: falha ao registrar as novas tentativas de exclusão")
        return 0, len(lista)
    if apagadas:
        logger.info("Voz clínica: %d gravação(ões) pendente(s) apagada(s) do storage", apagadas)
    return apagadas, len(lista) - apagadas
