"""Índices compostos de qualidade vocal calculados a partir de medidas simples."""

from __future__ import annotations


def dsi(tmf_s: float, f0_alta_hz: float, i_baixa_db_spl: float, jitter_pct: float) -> dict:
    """Dysphonia Severity Index (Wuyts et al., 2000).

    DSI = 0,13 x TMF + 0,0053 x F0-alta - 0,26 x I-baixa - 1,18 x jitter(%) + 12,4

    - tmf_s: tempo máximo de fonação da vogal /a/, em segundos
    - f0_alta_hz: frequência mais aguda alcançada (fonetograma), em Hz
    - i_baixa_db_spl: intensidade mais fraca sustentada, em dB SPL (exige
      microfone calibrado)
    - jitter_pct: jitter local da vogal sustentada, em %

    Referência: +5 indica voz normal; -5 indica disfonia grave.
    """
    for nome, valor in (("tmf_s", tmf_s), ("f0_alta_hz", f0_alta_hz),
                        ("i_baixa_db_spl", i_baixa_db_spl), ("jitter_pct", jitter_pct)):
        if valor is None or valor < 0:
            raise ValueError(f"Valor inválido para {nome}.")
    valor = 0.13 * tmf_s + 0.0053 * f0_alta_hz - 0.26 * i_baixa_db_spl - 1.18 * jitter_pct + 12.4
    return {
        "dsi": round(valor, 2),
        "escala": "de -5 (disfonia grave) a +5 (voz normal); interpretar junto com a avaliação clínica",
        "referencia": "Wuyts et al., 2000 (J Speech Lang Hear Res 43:796-809)",
    }
