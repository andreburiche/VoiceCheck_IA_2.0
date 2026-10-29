"""
VoiceCheck — feedback pedagógico a partir de eventos verificados.
Sugestões, não prescrições clínicas.
"""

from __future__ import annotations

from typing import Any

_RECS: dict[str, dict[str, str]] = {
    "pitch_low": {
        "title": "Afinação abaixo da referência",
        "text": (
            "Ouça a nota de referência e repita o trecho lentamente, buscando estabilizar a altura "
            "sem aumentar o esforço vocal. Pratique o intervalo melódico que antecede a nota."
        ),
        "exercise": "Loop de 2 compassos: referência → canto → silêncio → referência.",
    },
    "pitch_high": {
        "title": "Afinação acima da referência",
        "text": (
            "Compare auditivamente a sua nota com a referência. Repita de forma controlada e ajuste "
            "a altura gradualmente, sem forçar o volume."
        ),
        "exercise": "Desça a nota em glissando curto até coincidir com a referência.",
    },
    "early": {
        "title": "Entrada antecipada",
        "text": (
            "Use metrônomo e uma contagem preparatória. Isole só a entrada em loop curto antes de "
            "cantar a frase completa."
        ),
        "exercise": "4 cliques de preparação + ataque apenas da primeira sílaba.",
    },
    "late": {
        "title": "Entrada atrasada",
        "text": (
            "Pratique com metrônomo e contagem preparatória (ex.: 4 tempos). Antecipe mentalmente o "
            "ataque da sílaba sem adiantar o corpo."
        ),
        "exercise": "Marque o ataque com a mão no tempo 1 e cante só a entrada.",
    },
    "shortened": {
        "title": "Nota encurtada",
        "text": (
            "Repita o trecho cuidando da duração escrita. Sustente de forma confortável até o fim "
            "da figura — sem strain."
        ),
        "exercise": "Sustentação cronometrada da figura (metrônomo + contagem).",
    },
    "prolonged": {
        "title": "Nota prolongada",
        "text": (
            "Observe o ponto de corte da referência. Ensaie a frase marcando o fim da nota com a mão "
            "ou o metrônomo."
        ),
        "exercise": "Corte deliberado no tempo escrito, depois cante a frase completa.",
    },
    "stability": {
        "title": "Estabilidade da sustentação",
        "text": (
            "Pratique sustentação em volume confortável por 3–4 segundos. Oscilação pode ser vibrato "
            "natural — foque em intenção clara da altura central."
        ),
        "exercise": "Sustenido em vogal /a/ ou /u/ por 4s, volume médio, sem forçar.",
    },
    "voice_break": {
        "title": "Continuidade da emissão",
        "text": (
            "Repita o trecho lentamente e observe se a interrupção se repete. Experimente menos "
            "pressão e ataque mais suave na região."
        ),
        "exercise": "Glissando lento atravessando o trecho, depois a frase no tempo.",
    },
    "dynamics_drop": {
        "title": "Controle de intensidade",
        "text": (
            "Ouça o trecho e verifique se a queda de volume foi intencional. Pratique manter o "
            "envelope estável em volume confortável."
        ),
        "exercise": "Mesma frase em mf constante, depois com crescendo controlado.",
    },
    "clipping": {
        "title": "Nível de gravação",
        "text": (
            "Reduza o ganho do microfone/interface ou afaste-se um pouco. Clipping mascara a análise "
            "de F0 e dinâmica."
        ),
        "exercise": "Regrave com pico em torno de -6 dBFS.",
    },
    "breath_noise": {
        "title": "Respiração entre frases",
        "text": (
            "Se a inspiração estiver audível demais, experimente respirar um pouco antes do fim da "
            "frase anterior e reduzir o fluxo na tomada de ar."
        ),
        "exercise": "Frase curta + respiração silenciosa cronometrada + frase seguinte.",
    },
    "phrasing": {
        "title": "Ligação de frase",
        "text": (
            "Verifique se a microinterrupção é articulação desejada. Se não, pratique legato "
            "conectando as duas regiões."
        ),
        "exercise": "Legato em vogal única cobrindo as duas regiões.",
    },
    "missing_note": {
        "title": "Possível nota omitida",
        "text": (
            "Confira a partitura/referência e cante a sequência lentamente. Se a nota existir na sua "
            "gravação mas o alinhamento falhou, refine o offset ou a trilha MIDI."
        ),
        "exercise": "Solfejo lento da sequência com metrônomo.",
    },
    "transposition": {
        "title": "Possível transposição",
        "text": (
            "Se você cantou de propósito em outro tom, aceite a transposição e recalcule. Caso "
            "contrário, pratique a tonalidade da referência."
        ),
        "exercise": "Cante a tônica da referência antes da frase.",
    },
    "insufficient": {
        "title": "Trecho inconclusivo",
        "text": (
            "Grave novamente com menos ruído e mais sustentação, ou ajuste a faixa F0. Não inventamos "
            "avaliações sem frames confiáveis."
        ),
        "exercise": "Regravação em ambiente mais silencioso, 5–10s de vogal sustentada.",
    },
    "melodic_consistency_review": {
        "title": "Revisão de frases semelhantes",
        "text": (
            "Duas frases com contorno parecido diferem em altura ou duração. Ouça lado a lado e "
            "decida se a variação foi artística ou involuntária — o sistema não marca isso como erro."
        ),
        "exercise": "Loop A/B das duas frases; cante a segunda espelhando a primeira, depois com a variação consciente.",
    },
}


def enrich_events_with_feedback(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Anexa orientação/exercício aos eventos que têm recommendation_key."""
    out: list[dict[str, Any]] = []
    for ev in events:
        e = dict(ev)
        key = str(e.get("recommendation_key") or "")
        base = _RECS.get(key) if key else None
        if base:
            e.setdefault("guidance", base["text"])
            e.setdefault("exercise", base.get("exercise"))
            e.setdefault("feedback_title", base["title"])
        e.setdefault(
            "playback",
            {
                "start_seconds": max(0.0, float(e.get("start_seconds") or 0) - 0.15),
                "end_seconds": float(e.get("end_seconds") or 0) + 0.15,
            },
        )
        out.append(e)
    return out


def recommendations_from_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for ev in events:
        key = str(ev.get("recommendation_key") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        base = _RECS.get(key)
        if not base:
            continue
        out.append(
            {
                "key": key,
                "title": base["title"],
                "text": base["text"],
                "exercise": base.get("exercise"),
                "related_event_id": ev.get("id"),
                "category": ev.get("category"),
                "start_seconds": ev.get("start_seconds"),
                "end_seconds": ev.get("end_seconds"),
                "disclaimer": (
                    "Orientação pedagógica com base na medição — não é diagnóstico clínico "
                    "nem fonoaudiológico."
                ),
            }
        )
    return out
