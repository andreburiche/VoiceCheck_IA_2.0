"""Escore automático dos protocolos de autoavaliação e da escala perceptiva.

Os textos das perguntas não estão aqui: use a versão validada impressa (ou
licenciada) de cada instrumento. Este módulo recebe apenas as respostas
numéricas, na ordem dos itens.
"""

from __future__ import annotations


class ErroProtocolo(ValueError):
    """Respostas inválidas para o protocolo."""


def _validar(respostas, n_itens: int, minimo: int, maximo: int, nome: str) -> list[int]:
    if not isinstance(respostas, (list, tuple)) or len(respostas) != n_itens:
        raise ErroProtocolo(f"{nome}: envie exatamente {n_itens} respostas, na ordem dos itens.")
    saida = []
    for i, r in enumerate(respostas, start=1):
        if isinstance(r, bool) or not isinstance(r, int) or not (minimo <= r <= maximo):
            raise ErroProtocolo(f"{nome}: item {i} precisa ser um inteiro de {minimo} a {maximo}.")
        saida.append(r)
    return saida


# --------------------------------------------------------------------------
# IDV-10 — Índice de Desvantagem Vocal 10 (Rosen et al., 2004; versão
# brasileira validada por Costa et al., 2013)
# --------------------------------------------------------------------------

IDV10_CORTE = 7.5  # Behlau et al., 2016: separa disfônicos de vocalmente saudáveis


def idv10(respostas) -> dict:
    """10 itens de 0 (nunca) a 4 (sempre). Escore total de 0 a 40."""
    r = _validar(respostas, 10, 0, 4, "IDV-10")
    total = sum(r)
    return {
        "protocolo": "IDV-10",
        "total": total,
        "maximo": 40,
        "acima_do_corte": total > IDV10_CORTE,
        "corte": IDV10_CORTE,
        "leitura": "quanto maior, maior a desvantagem vocal percebida",
        "referencias": [
            "Rosen et al., 2004 (Laryngoscope 114:1549-1556)",
            "Costa et al., 2013 (validação brasileira)",
            "Behlau et al., 2016 (nota de corte 7,5)",
        ],
    }


# --------------------------------------------------------------------------
# QVV — Qualidade de Vida em Voz (V-RQOL: Hogikyan & Sethuraman, 1999;
# versão brasileira: Gasparini & Behlau, 2009)
# --------------------------------------------------------------------------

QVV_FISICO = (1, 2, 3, 6, 7, 9)
QVV_SOCIOEMOCIONAL = (4, 5, 8, 10)
QVV_CORTE_TOTAL = 91.25  # Behlau et al., 2016


def _padronizar(bruto: int, n_itens: int) -> float:
    """100 = sem impacto; 0 = impacto máximo. Mínimo bruto = n, máximo = 5n."""
    return round(100 - (bruto - n_itens) / (4 * n_itens) * 100, 2)


def qvv(respostas) -> dict:
    """10 itens de 1 (não é um problema) a 5 (é um problema muito grande)."""
    r = _validar(respostas, 10, 1, 5, "QVV")
    item = dict(enumerate(r, start=1))
    fisico = sum(item[i] for i in QVV_FISICO)
    socio = sum(item[i] for i in QVV_SOCIOEMOCIONAL)
    total = _padronizar(sum(r), 10)
    return {
        "protocolo": "QVV",
        "total": total,
        "fisico": _padronizar(fisico, len(QVV_FISICO)),
        "socioemocional": _padronizar(socio, len(QVV_SOCIOEMOCIONAL)),
        "abaixo_do_corte": total < QVV_CORTE_TOTAL,
        "corte_total": QVV_CORTE_TOTAL,
        "itens_com_problema": [i for i, v in item.items() if v >= 3],
        "leitura": "de 0 a 100; quanto maior, melhor a qualidade de vida em voz",
        "referencias": [
            "Hogikyan & Sethuraman, 1999 (J Voice 13:557-569)",
            "Gasparini & Behlau, 2009 (validação brasileira)",
            "Behlau et al., 2016 (nota de corte 91,25)",
        ],
    }


# --------------------------------------------------------------------------
# GRBASI — avaliação perceptivo-auditiva (Hirano, 1981; I por Dejonckere)
# --------------------------------------------------------------------------

GRBASI_PARAMETROS = {
    "G": "grau geral",
    "R": "rugosidade",
    "B": "soprosidade",
    "A": "astenia",
    "S": "tensão",
    "I": "instabilidade",
}
GRBASI_NIVEIS = {0: "normal", 1: "leve", 2: "moderado", 3: "intenso"}


def grbasi(notas) -> dict:
    """Recebe {"G": 0-3, "R": 0-3, ...}. Não há soma: cada parâmetro é lido sozinho."""
    if not isinstance(notas, dict):
        raise ErroProtocolo("GRBASI: envie um objeto com as letras G, R, B, A, S e I.")
    faltando = [p for p in GRBASI_PARAMETROS if p not in notas]
    if faltando:
        raise ErroProtocolo(f"GRBASI: faltam os parâmetros {', '.join(faltando)}.")
    saida = {}
    for p, nome in GRBASI_PARAMETROS.items():
        v = notas[p]
        if isinstance(v, bool) or not isinstance(v, int) or v not in GRBASI_NIVEIS:
            raise ErroProtocolo(f"GRBASI: {p} ({nome}) precisa ser 0, 1, 2 ou 3.")
        saida[p] = {"nome": nome, "nota": v, "nivel": GRBASI_NIVEIS[v]}
    return {
        "protocolo": "GRBASI",
        "parametros": saida,
        "registro": "G{G}R{R}B{B}A{A}S{S}I{I}".format(**{p: notas[p] for p in GRBASI_PARAMETROS}),
    }


# --------------------------------------------------------------------------
# EASE-BR — Evaluation of the Ability to Sing Easily (Phyland et al., 2013;
# adaptação brasileira: Rocha, Moreti, Amin, Madazio & Behlau, CoDAS 2014)
# --------------------------------------------------------------------------

#: Itens de redação positiva, somados de forma reversa (Rocha et al., 2014).
EASEBR_POSITIVOS = (6, 12, 21)
EASEBR_RESPOSTAS = {0: "não", 1: "um pouco", 2: "moderadamente", 3: "muito"}


def easebr(respostas) -> dict:
    """22 itens. Cada resposta é a opção marcada: 0 não, 1 um pouco, 2 moderadamente, 3 muito.

    Itens negativos valem a própria opção; os positivos (6, 12, 21) valem 3 − opção.
    Escore total de 0 a 66. A versão brasileira não publicou nota de corte nem
    subescalas, então nenhuma é aplicada aqui.
    """
    r = _validar(respostas, 22, 0, 3, "EASE-BR")
    pontos = {i: (3 - v if i in EASEBR_POSITIVOS else v) for i, v in enumerate(r, start=1)}
    return {
        "protocolo": "EASE-BR",
        "total": sum(pontos.values()),
        "maximo": 66,
        "itens_positivos": list(EASEBR_POSITIVOS),
        #: itens que somaram 2 ou 3 pontos (já com a inversão dos positivos)
        "itens_com_queixa": [i for i, v in pontos.items() if v >= 2],
        "leitura": "quanto maior, mais fadiga e limitação vocal percebidas no canto; sem nota de corte publicada no Brasil",
        "referencias": [
            "Phyland et al., 2013 (J Voice 27:454-462)",
            "Rocha et al., 2014 (CoDAS 26:535-539, adaptação brasileira)",
        ],
    }


PROTOCOLOS = {"idv10": idv10, "qvv": qvv, "grbasi": grbasi, "easebr": easebr}
