"""Prática em casa: token do link, conferência e resumo das sessões vindas do celular.

O celular mede cada repetição (tempo com voz, % do tempo na faixa, F0 mediana)
e envia só esses números. Aqui eles são conferidos contra o plano e o resumo
da sessão é recalculado; nada do que o celular "resume" é aceito pronto.
"""

from __future__ import annotations

import hashlib
import secrets
import statistics
from datetime import datetime, timedelta, timezone

#: Tolerância para relógio do celular adiantado.
FOLGA_RELOGIO = timedelta(minutes=10)


class ErroSessao(ValueError):
    """Sessão que não combina com o plano."""


def novo_token() -> str:
    """Segredo do link (256 bits). Só o hash vai para o banco."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _utc(d: datetime) -> datetime:
    # com fuso (ex.: -03:00 do celular) converte para UTC: o banco grava sem fuso
    return d.astimezone(timezone.utc) if d.tzinfo else d.replace(tzinfo=timezone.utc)


def plano_ativo(expira_em: datetime, revogado_em: datetime | None, agora: datetime) -> bool:
    return revogado_em is None and _utc(expira_em) > _utc(agora)


def conferir_data(feito_em: datetime, criado_em: datetime, expira_em: datetime, agora: datetime) -> datetime:
    """A sessão precisa ter sido feita enquanto o link valia (com folga para o relógio do celular)."""
    feito_em, criado_em, expira_em, agora = map(_utc, (feito_em, criado_em, expira_em, agora))
    if feito_em < criado_em - FOLGA_RELOGIO:
        raise ErroSessao("sessão anterior à criação do plano")
    if feito_em > min(agora, expira_em) + FOLGA_RELOGIO:
        raise ErroSessao("data da sessão no futuro ou depois do fim do plano")
    return min(feito_em, agora)


def resumir_sessao(exercicio: dict, repeticoes: list[dict]) -> dict:
    """Confere as repetições contra o exercício do plano e calcula o resumo.

    `exercicio`: um item de HomePracticePlan.exercises.
    `repeticoes`: [{"duracao_s", "fonacao_s", "dentro_pct", "f0_mediana_hz"}] já validados no esquema.
    """
    if not repeticoes:
        raise ErroSessao("sessão sem repetições")
    if len(repeticoes) > exercicio["repeticoes"]:
        raise ErroSessao(f"mais repetições ({len(repeticoes)}) do que o plano pede ({exercicio['repeticoes']})")
    tipo = exercicio["tipo"]
    limite = exercicio.get("duracao_s") or 60
    for i, r in enumerate(repeticoes, start=1):
        if r["duracao_s"] > limite + 2:
            raise ErroSessao(f"repetição {i} mais longa que o exercício ({limite:g} s)")
        if r["fonacao_s"] > r["duracao_s"] + 0.5:
            raise ErroSessao(f"repetição {i}: tempo com voz maior que a duração")
        if tipo != "sustentar" and r.get("dentro_pct") is None and r["fonacao_s"] > 0:
            raise ErroSessao(f"repetição {i}: falta o % na faixa")

    fonacao = [r["fonacao_s"] for r in repeticoes]
    resumo: dict = {"repeticoes_feitas": len(repeticoes), "repeticoes_pedidas": exercicio["repeticoes"]}
    if tipo == "sustentar":
        resumo["melhor_s"] = round(max(fonacao), 1)
        resumo["media_s"] = round(statistics.fmean(fonacao), 1)
        if exercicio.get("meta_s"):
            resumo["meta_s"] = exercicio["meta_s"]
            resumo["atingiu_meta"] = max(fonacao) >= exercicio["meta_s"]
    else:
        dentro = [r["dentro_pct"] for r in repeticoes if r.get("dentro_pct") is not None]
        resumo["dentro_pct"] = round(statistics.fmean(dentro), 1) if dentro else None
        resumo["fonacao_s"] = round(sum(fonacao), 1)
        f0 = [r["f0_mediana_hz"] for r in repeticoes if r.get("f0_mediana_hz")]
        resumo["f0_mediana_hz"] = round(statistics.median(f0), 1) if f0 else None
    return resumo
