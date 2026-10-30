"""Gravações que o storage não apagou ficam pendentes e são apagadas numa nova tentativa (LGPD)."""

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.models import StoragePendingDelete
from app.services.voz_clinica import exclusao


class StorageInstavel:
    """Falha nas chaves de `fora_do_ar` enquanto `quebrado` for verdadeiro."""

    def __init__(self, fora_do_ar):
        self.fora_do_ar, self.quebrado, self.apagados = set(fora_do_ar), True, []

    def delete(self, chave):
        if self.quebrado and chave in self.fora_do_ar:
            raise ConnectionError("S3 fora do ar")
        self.apagados.append(chave)


@pytest.fixture
def db():
    motor = create_engine("sqlite://")
    StoragePendingDelete.__table__.create(motor)
    sessao = sessionmaker(bind=motor)()
    yield sessao
    sessao.close()


def _pendentes(db):
    return {p.storage_key: p.attempts for p in db.scalars(select(StoragePendingDelete)).all()}


def test_falha_fica_pendente_e_nova_tentativa_apaga(db, monkeypatch):
    st = StorageInstavel({"voz/u1/b.wav"})
    monkeypatch.setattr(exclusao, "get_storage", lambda: st)

    assert exclusao.apagar_ou_agendar(db, ["voz/u1/a.wav", "voz/u1/b.wav", ""]) == 1
    assert st.apagados == ["voz/u1/a.wav"]
    assert _pendentes(db) == {"voz/u1/b.wav": 1}

    # storage ainda fora: a tentativa conta, a pendência continua
    assert exclusao.tentar_pendentes(db) == (0, 1)
    assert _pendentes(db) == {"voz/u1/b.wav": 2}
    assert "S3 fora do ar" in db.scalar(select(StoragePendingDelete.last_error))

    # voltou: apaga e some da tabela
    st.quebrado = False
    assert exclusao.tentar_pendentes(db) == (1, 0)
    assert st.apagados[-1] == "voz/u1/b.wav" and _pendentes(db) == {}


def test_mesma_chave_falhando_de_novo_nao_duplica(db, monkeypatch):
    st = StorageInstavel({"voz/u1/c.wav"})
    monkeypatch.setattr(exclusao, "get_storage", lambda: st)
    exclusao.apagar_ou_agendar(db, ["voz/u1/c.wav"])
    exclusao.apagar_ou_agendar(db, ["voz/u1/c.wav"])
    assert _pendentes(db) == {"voz/u1/c.wav": 2}


def test_sem_tabela_nao_quebra(monkeypatch):
    """Banco sem a migração 0015 (ou fora do ar): a nova tentativa só registra no log."""
    sessao = sessionmaker(bind=create_engine("sqlite://"))()
    monkeypatch.setattr(exclusao, "get_storage", lambda: StorageInstavel(set()))
    assert exclusao.tentar_pendentes(sessao) == (0, 0)
