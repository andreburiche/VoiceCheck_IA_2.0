"""Resumo do fonetograma (campo vocal) a partir dos pontos por semitom.

Intensidade em dBFS (relativa). Com a calibração por decibelímetro feita no navegador
(dB SPL = dBFS + deslocamento), o resumo também sai em dB SPL.
"""

from __future__ import annotations

NOTAS = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def nome_nota(midi: int) -> str:
    return f"{NOTAS[midi % 12]}{midi // 12 - 1}"


def hz_da_nota(midi: int) -> float:
    return round(440.0 * 2 ** ((midi - 69) / 12), 1)


def resumir_campo(pontos: list[dict]) -> dict:
    """pontos: [{"midi", "min_db", "max_db", ...}] — mesma regra do navegador."""
    if not pontos:
        return {"nota_grave": None, "nota_aguda": None, "hz_grave": None, "hz_agudo": None, "extensao_st": 0,
                "semitons_alcancados": 0, "db_min": None, "db_max": None, "faixa_dinamica_media_db": None, "area_st_db": 0.0}
    ordenados = sorted(pontos, key=lambda p: p["midi"])
    grave, agudo = ordenados[0], ordenados[-1]
    faixas = [p["max_db"] - p["min_db"] for p in ordenados]
    return {
        "nota_grave": nome_nota(grave["midi"]),
        "nota_aguda": nome_nota(agudo["midi"]),
        "hz_grave": hz_da_nota(grave["midi"]),
        "hz_agudo": hz_da_nota(agudo["midi"]),
        "extensao_st": agudo["midi"] - grave["midi"],
        "semitons_alcancados": len(ordenados),
        "db_min": round(min(p["min_db"] for p in ordenados), 1),
        "db_max": round(max(p["max_db"] for p in ordenados), 1),
        "faixa_dinamica_media_db": round(sum(faixas) / len(faixas), 1),
        "area_st_db": round(sum(faixas), 1),
    }


def resumo_em_spl(resumo: dict, deslocamento_db: float) -> dict:
    """Mínimo e máximo em dB SPL; faixa dinâmica e área não mudam (são diferenças)."""
    def spl(v):
        return None if v is None else round(v + deslocamento_db, 1)

    return {"db_min": spl(resumo.get("db_min")), "db_max": spl(resumo.get("db_max")), "deslocamento_db": round(deslocamento_db, 1)}
