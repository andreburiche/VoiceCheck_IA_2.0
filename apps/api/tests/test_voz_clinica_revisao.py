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
