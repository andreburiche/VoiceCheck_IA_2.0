"""Prática em casa: token, datas, resumo das sessões e esquemas (sem banco)."""

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.schemas.voz_clinica import ExercicioPratica, PlanoEntrada, SessaoPratica
from app.services.voz_clinica import pratica as p

T0 = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
SUSTENTAR = {"tipo": "sustentar", "titulo": "Vogal /a/", "repeticoes": 3, "meta_s": 15}
PITCH = {"tipo": "pitch", "titulo": "Grave", "repeticoes": 2, "duracao_s": 10, "faixa_hz": {"min": 100, "max": 150}}


def rep(dur, fon, dentro=None, f0=None):
    return {"duracao_s": dur, "fonacao_s": fon, "dentro_pct": dentro, "f0_mediana_hz": f0}


def test_token_e_hash():
    t = p.novo_token()
    assert len(t) >= 43 and t != p.novo_token()
    assert p.hash_token(t) == p.hash_token(t) and len(p.hash_token(t)) == 64 and t not in p.hash_token(t)


def test_plano_ativo():
    assert p.plano_ativo(T0 + timedelta(days=1), None, T0)
    assert not p.plano_ativo(T0 - timedelta(seconds=1), None, T0)
    assert not p.plano_ativo(T0 + timedelta(days=1), T0, T0)


def test_datas_da_sessao():
    criado, expira, agora = T0, T0 + timedelta(days=30), T0 + timedelta(days=5)
    assert p.conferir_data(T0 + timedelta(days=2), criado, expira, agora) == T0 + timedelta(days=2)
    # relógio do celular 5 min adiantado: aceita, mas grava como "agora"
    assert p.conferir_data(agora + timedelta(minutes=5), criado, expira, agora) == agora
    for ruim in (criado - timedelta(hours=1), agora + timedelta(hours=1)):
        with pytest.raises(p.ErroSessao):
            p.conferir_data(ruim, criado, expira, agora)
    # sessão feita offline antes de expirar, enviada depois: aceita
    assert p.conferir_data(expira - timedelta(hours=1), criado, expira, expira + timedelta(days=2))
    with pytest.raises(p.ErroSessao):  # feita depois do fim do plano
        p.conferir_data(expira + timedelta(days=1), criado, expira, expira + timedelta(days=2))


def test_resumo_sustentar():
    r = p.resumir_sessao(SUSTENTAR, [rep(14, 12.04), rep(17, 16.0)])
    assert r == {"repeticoes_feitas": 2, "repeticoes_pedidas": 3, "melhor_s": 16.0, "media_s": 14.0,
                 "meta_s": 15, "atingiu_meta": True}


def test_resumo_pitch():
    r = p.resumir_sessao(PITCH, [rep(10, 8, 80, 120), rep(10, 9, 60, 130)])
    assert r["dentro_pct"] == 70.0 and r["f0_mediana_hz"] == 125.0 and r["fonacao_s"] == 17.0


def test_tentativa_sem_voz_conta_sem_pct():
    r = p.resumir_sessao(PITCH, [rep(10, 0), rep(10, 8, 50, 120)])
    assert r["dentro_pct"] == 50.0


@pytest.mark.parametrize("reps", [
    [],
    [rep(5, 5)] * 4,  # mais do que o plano pede
    [rep(70, 10)],  # mais longa que o limite
    [rep(5, 9)],  # voz por mais tempo que a duração
])
def test_resumo_recusa_sustentar(reps):
    with pytest.raises(p.ErroSessao):
        p.resumir_sessao(SUSTENTAR, reps)


def test_pitch_com_voz_exige_pct():
    with pytest.raises(p.ErroSessao):
        p.resumir_sessao(PITCH, [rep(10, 8)])


def test_esquema_do_exercicio():
    assert ExercicioPratica(**PITCH).faixa_hz.max == 150
    for ruim in (
        {**SUSTENTAR, "faixa_hz": {"min": 100, "max": 150}},
        {**PITCH, "duracao_s": None},
        {**PITCH, "faixa_hz": None},
        {**PITCH, "faixa_db": {"min": -30, "max": -10}},
        {**PITCH, "meta_s": 5},
        {"tipo": "volume", "titulo": "Forte", "repeticoes": 1, "duracao_s": 10, "faixa_hz": {"min": 100, "max": 150}},
        {**SUSTENTAR, "repeticoes": 11},
        {**SUSTENTAR, "titulo": "   "},
        {**SUSTENTAR, "extra": 1},
    ):
        with pytest.raises(ValidationError):
            ExercicioPratica(**ruim)


def test_esquema_do_plano_e_da_sessao():
    PlanoEntrada(paciente="Ana", exercicios=[SUSTENTAR])
    with pytest.raises(ValidationError):
        PlanoEntrada(paciente="Ana", exercicios=[SUSTENTAR] * 7)
    with pytest.raises(ValidationError):
        PlanoEntrada(paciente="Ana", exercicios=[SUSTENTAR], validade_dias=181)
    ok = {"id": "0f8fad5b-d9cb-469f-a165-70867728950e", "exercicio": 0, "feito_em": T0.isoformat(), "repeticoes": [rep(5, 4)]}
    SessaoPratica(**ok)
    for ruim in ({**ok, "id": "abc"}, {**ok, "repeticoes": []}, {**ok, "exercicio": 6}):
        with pytest.raises(ValidationError):
            SessaoPratica(**ruim)
