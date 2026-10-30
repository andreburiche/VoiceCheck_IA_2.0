"""Correções da revisão de segurança/LGPD do módulo de voz (sem banco)."""

import io
import logging
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from scipy.io import wavfile

from app.services import voz_clinica
from app.services.voz_clinica.audio import Audio, limitar_duracao
from app.services.voz_clinica.pratica import conferir_data


def _wav_float(x: np.ndarray, taxa: int = 16000) -> bytes:
    buf = io.BytesIO()
    wavfile.write(buf, taxa, x.astype(np.float32))
    return buf.getvalue()


def test_wav_com_nan_e_recusado():
    x = np.sin(np.arange(16000) / 10.0) * 0.5
    x[100] = np.nan
    with pytest.raises(voz_clinica.ErroAudio, match="inválidas"):
        voz_clinica.ler_wav(_wav_float(x))


def test_limite_de_duracao():
    a = Audio(np.zeros(16000 * 61), 16000)
    with pytest.raises(voz_clinica.ErroAudio, match="limite é 60 s"):
        limitar_duracao(a, 60)
    assert limitar_duracao(Audio(np.zeros(16000 * 10), 16000), 60).duracao == 10


def test_sessao_com_fuso_vira_utc():
    criado = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)
    brasilia = timezone(timedelta(hours=-3))
    feito = datetime(2026, 10, 29, 22, 30, tzinfo=brasilia)  # 01:30 UTC do dia 30
    r = conferir_data(feito, criado, criado + timedelta(days=7), datetime(2026, 10, 30, 2, 0, tzinfo=timezone.utc))
    assert r.utcoffset() == timedelta(0) and r.hour == 1 and r.day == 30


def test_log_de_acesso_sem_nome_do_paciente():
    from app.main import _SemConsultaNoLogDeAcesso

    rec = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
                            ("1.2.3.4:5", "GET", "/api/v1/voz-clinica/avaliacoes?paciente=Ana%20Souza", "1.1", 200), None)
    _SemConsultaNoLogDeAcesso().filter(rec)
    assert "Ana" not in rec.getMessage() and "/voz-clinica/avaliacoes?…" in rec.getMessage()
    outro = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d',
                              ("1.2.3.4:5", "GET", "/api/v1/projects?page=2", "1.1", 200), None)
    _SemConsultaNoLogDeAcesso().filter(outro)
    assert "page=2" in outro.getMessage()


def test_rastro_da_auditoria_usa_segredo():
    import hashlib

    from app.api.v1.voz_clinica import _rastro

    assert _rastro("u1", "Ana") != hashlib.sha256(b"u1:Ana").hexdigest()[:16]
    assert _rastro("u1", "Ana") == _rastro("u1", "Ana") and len(_rastro("u1", "Ana")) == 16


class _BancoFalso:
    """Registra a ordem das chamadas que _guardar_audio faz no banco."""

    def __init__(self, log: list, falhar_commit: bool = False):
        self.log, self.falhar_commit = log, falhar_commit

    def execute(self, stmt):
        texto = str(stmt.compile(compile_kwargs={"literal_binds": False})).upper()
        self.log.append("trava" if "FOR UPDATE" in texto else "update")

    def commit(self):
        if self.falhar_commit:
            raise RuntimeError("banco caiu")
        self.log.append("commit")

    def rollback(self):
        self.log.append("rollback")


class _StorageFalso:
    def __init__(self, log: list):
        self.log = log

    def put_bytes(self, chave, dados, tipo):
        self.log.append("envio")


def _preparar(monkeypatch, log, cota_cheia=False):
    from app.api.v1 import voz_clinica as rotas
    from app.services.quotas import QuotaExceeded

    def cota(db, user_id, n):
        log.append("cota")
        if cota_cheia:
            raise QuotaExceeded("QUOTA_STORAGE", "Cota de armazenamento esgotada (100/100 MB)")

    monkeypatch.setattr(rotas, "assert_can_upload", cota)
    monkeypatch.setattr(rotas, "get_storage", lambda: _StorageFalso(log))
    monkeypatch.setattr(rotas, "_apagar_audios", lambda db, chaves: log.append("apagou"))
    return rotas


def test_cota_e_conferida_com_o_usuario_travado(monkeypatch):
    import asyncio

    log: list = []
    rotas = _preparar(monkeypatch, log)
    aviso, ok = asyncio.run(rotas._guardar_audio(_BancoFalso(log), "u1", "a1", b"x" * 10))
    assert ok and aviso is None
    # a trava vem antes da soma da cota; o arquivo só sobe depois de conferida
    assert log == ["trava", "cota", "envio", "update", "commit"]


def test_cota_cheia_nao_envia_arquivo(monkeypatch):
    import asyncio

    log: list = []
    rotas = _preparar(monkeypatch, log, cota_cheia=True)
    aviso, ok = asyncio.run(rotas._guardar_audio(_BancoFalso(log), "u1", "a1", b"x"))
    assert not ok and "salva sem a gravação" in aviso
    assert "envio" not in log and log[-1] == "rollback"


def test_banco_falha_depois_do_envio_apaga_o_arquivo(monkeypatch):
    import asyncio

    log: list = []
    rotas = _preparar(monkeypatch, log)
    aviso, ok = asyncio.run(rotas._guardar_audio(_BancoFalso(log, falhar_commit=True), "u1", "a1", b"x"))
    assert not ok and "salva sem ela" in aviso
    assert log[-2:] == ["rollback", "apagou"]
