"""Sessão SQLAlchemy compartilhando models da API (PYTHONPATH=/api)."""

from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

_engine = None
_SessionLocal = None


def get_session() -> Session:
    global _engine, _SessionLocal
    if _SessionLocal is None:
        url = os.getenv("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL não configurada no worker")
        _engine = create_engine(url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _SessionLocal()
