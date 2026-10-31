"""Plano de um job de separação: modelo Demucs, faixas e qualidade (sem banco nem Demucs: testável)."""

from __future__ import annotations

import os

STEM_ORDER_4 = ["vocals", "drums", "bass", "other"]
TWO_STEM_MODELS = {"htdemucs_two"}


def plano_separacao(model_code: str, params: dict | None, duracao_ms: int | None) -> dict:
    """Modelo Demucs, faixas pedidas ao adaptador, faixas finais e qualidade de um job (testável sem Demucs)."""
    from app.services.separacao import MODELOS, opcoes_demucs, tempo_limite_s

    modelo, faixas_finais = MODELOS.get(model_code, MODELOS["htdemucs"])
    two = model_code in TWO_STEM_MODELS
    shifts, overlap = opcoes_demucs(params)
    return {
        "modelo": modelo,
        "faixas_adaptador": tuple(STEM_ORDER_4) if two else faixas_finais,
        "faixas_finais": list(faixas_finais),
        "two_stem": two,
        "shifts": shifts,
        "overlap": overlap,
        "timeout_s": tempo_limite_s(model_code, duracao_ms, shifts,
                                    base_s=float(os.getenv("INFERENCE_TIMEOUT_SECONDS", "1800"))),
    }
