"""
VoiceCheck — Devolutiva Vocal do Aluno (camada pedagógica).

Consome o JSON de análise já calculado. Não reexecuta DSP.
Não inventa ocorrências nem pontos positivos.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

DEVOLUTIVA_VERSION = "voicecheck_devolutiva_v1"

# Textos simples por categoria técnica (offline, parametrizados)
_CAT: dict[str, dict[str, str]] = {
    "unstable_sustained_pitch": {
        "name": "Oscilações na nota sustentada",
        "explain": (
            "Enquanto você segurava a nota, a altura variou de forma irregular. "
            "Isso pode ser busca de apoio ou vibrato irregular — não é automaticamente um erro."
        ),
        "guidance": "Pratique sustentar a vogal em volume confortável, com a altura central clara.",
        "exercise": "Sustenido em /a/ ou /u/ por 4 segundos",
        "how": "Escolha uma nota confortável. Sustente 4s sem forçar. Repita 4 vezes.",
        "duration": "4 repetições · ~5 min",
    },
    "possible_voice_break": {
        "name": "Possível interrupção da emissão",
        "explain": (
            "Houve uma pausa breve no som em um trecho sustentado. "
            "Pode ser passagem, respiração ou limitação da análise — tratamos como ponto a revisar."
        ),
        "guidance": "Repita o trecho mais devagar, com menos pressão, e ouça se a interrupção se repete.",
        "exercise": "Glissando lento no trecho",
        "how": "Passe a voz lentamente pela região. Depois cante a frase no tempo.",
        "duration": "5 minutos · 4 loops",
    },
    "irregular_pitch_modulation": {
        "name": "Oscilação irregular de altura",
        "explain": "A altura oscilou sem um padrão claro de vibrato.",
        "guidance": "Isole o trecho e cante com menos movimento; depois reintroduza a expressão.",
        "exercise": "Nota estável → expressão",
        "how": "Primeiro sustente limpo; só depois adicione movimento expressivo.",
        "duration": "5 minutos",
    },
    "abrupt_intensity_drop": {
        "name": "Queda rápida de intensidade",
        "explain": "O volume caiu de forma abrupta em um trecho com voz.",
        "guidance": "Ouça o trecho e pratique manter o envelope estável, se essa for a intenção.",
        "exercise": "Frase em mf constante",
        "how": "Cante a mesma frase mantendo volume médio confortável.",
        "duration": "4 repetições",
    },
    "possible_clipping": {
        "name": "Possível saturação na gravação",
        "explain": "O sinal chegou perto do limite digital — isso prejudica a análise e a escuta.",
        "guidance": "Regrave com ganho menor (pico perto de −6 dB) e distância estável do microfone.",
        "exercise": "Regravação com ganho ajustado",
        "how": "Baixe o ganho, teste 5s falando, depois cante o trecho.",
        "duration": "1 nova gravação",
    },
    "possible_audible_breath": {
        "name": "Possível respiração audível",
        "explain": (
            "Entre frases há um intervalo compatível com inspiração audível "
            "(heurística — não é certeza)."
        ),
        "guidance": "Respire um pouco antes do fim da frase e reduza o fluxo na tomada de ar.",
        "exercise": "Frase + respiração silenciosa",
        "how": "Cante frase curta, inspire com menos ruído, continue a frase seguinte.",
        "duration": "5 minutos",
    },
    "phrase_pause": {
        "name": "Pausa entre frases",
        "explain": "Há um intervalo sem emissão clara entre regiões cantadas — pode ser musical.",
        "guidance": "Marque as frases e alinhe as respirações com o sentido da música.",
        "exercise": "Marcar frases na partitura",
        "how": "Ouça e anote onde respira; pratique só as entradas.",
        "duration": "5 minutos",
    },
    "phrase_micro_gap": {
        "name": "Microinterrupção de frase",
        "explain": "Pequena descontinuidade entre regiões vozeadas.",
        "guidance": "Pratique legato conectando as duas regiões com uma vogal contínua.",
        "exercise": "Legato em vogal única",
        "how": "Una as duas regiões sem cortar o ar.",
        "duration": "4 repetições",
    },
    "pitch_below_reference": {
        "name": "Altura abaixo da referência",
        "explain": "Com referência musical, a nota ficou mais grave do que o esperado.",
        "guidance": "Ouça a referência e repita o trecho lentamente, estabilizando a altura.",
        "exercise": "Loop referência → canto",
        "how": "Ouça 1x, cante 1x, silêncio, ouça de novo.",
        "duration": "5 minutos · 4 loops",
    },
    "pitch_above_reference": {
        "name": "Altura acima da referência",
        "explain": "Com referência musical, a nota ficou mais aguda do que o esperado.",
        "guidance": "Compare com a referência e ajuste gradualmente, sem forçar o volume.",
        "exercise": "Ajuste gradual de altura",
        "how": "Desça em glissando curto até coincidir com a referência.",
        "duration": "5 minutos",
    },
}


def build_student_devolutiva(
    analysis: dict[str, Any],
    *,
    student_name: str | None = None,
    teacher_name: str | None = None,
    teacher_observations: str | None = None,
    final_message_override: str | None = None,
) -> dict[str, Any]:
    """Gera devolutiva pedagógica a partir do JSON de análise versionado."""
    events = list(analysis.get("events") or [])
    # Exclui coerência melódica experimental das prioridades “melhorar”
    # (já vem como ponto de revisão no relatório técnico/aluno longo)
    tech_events = [
        e
        for e in events
        if str(e.get("category") or "")
        not in {"regular_vibrato", "melodic_consistency_variation"}
    ]
    positives_raw = list(analysis.get("positive_findings") or [])
    no_ref = bool(analysis.get("no_reference", True))
    mode = str(analysis.get("mode") or "without_reference")

    # Agrupa por categoria
    by_cat: dict[str, list[dict[str, Any]]] = {}
    for ev in tech_events:
        cat = str(ev.get("category") or "other")
        # Sem referência: não priorizar afinação absoluta
        if no_ref and cat.startswith("pitch_"):
            continue
        by_cat.setdefault(cat, []).append(ev)

    def _conf(ev: dict[str, Any]) -> float:
        c = ev.get("confidence")
        try:
            return float(c) if c is not None else 0.45
        except (TypeError, ValueError):
            return 0.45

    priorities: list[dict[str, str]] = []
    exercises: list[dict[str, str]] = []
    ranked = sorted(
        by_cat.items(),
        key=lambda kv: (-len(kv[1]), -max(_conf(e) for e in kv[1])),
    )
    for cat, group in ranked[:3]:
        meta = _CAT.get(cat)
        lead = max(group, key=_conf)
        if meta:
            name = meta["name"]
            # Linguagem cautelosa para "possible_*"
            if cat.startswith("possible_"):
                name = meta["name"]  # já contém "Possível"
            explain = meta["explain"]
            guidance = str(lead.get("guidance") or meta["guidance"])
            priorities.append(
                {"name": name, "explanation": explain, "guidance": guidance}
            )
            exercises.append(
                {
                    "name": meta["exercise"],
                    "how_to": meta["how"],
                    "duration": meta["duration"],
                }
            )
        else:
            title = str(lead.get("title") or "Ponto observado")
            priorities.append(
                {
                    "name": title,
                    "explanation": str(lead.get("description") or "Observação acústica na gravação."),
                    "guidance": str(
                        lead.get("guidance")
                        or "Ouça o trecho e repita com intenção clara."
                    ),
                }
            )
            ex = lead.get("exercise")
            if ex:
                exercises.append(
                    {
                        "name": title,
                        "how_to": str(ex),
                        "duration": "5 minutos · 4 repetições",
                    }
                )

    # Exercícios das recomendações se faltarem
    recs = list(analysis.get("recommendations") or [])
    for r in recs:
        if len(exercises) >= 3:
            break
        ex = r.get("exercise")
        if not ex:
            continue
        key = str(r.get("key") or r.get("title") or "")
        if any(e["name"] == str(r.get("title") or key) for e in exercises):
            continue
        exercises.append(
            {
                "name": str(r.get("title") or "Exercício sugerido"),
                "how_to": str(ex),
                "duration": "5 minutos",
            }
        )
    exercises = exercises[:3]

    positives: list[dict[str, str]] = []
    for p in positives_raw[:3]:
        positives.append(
            {
                "title": str(p.get("title") or "Ponto positivo"),
                "text": str(p.get("description") or ""),
            }
        )

    how = _how_is_your_voice(analysis, priorities, positives, no_ref=no_ref)
    closing = final_message_override or _closing(priorities, positives)

    now = datetime.now(timezone.utc).isoformat()
    return {
        "devolutiva_version": DEVOLUTIVA_VERSION,
        "status": "draft",
        "generated_at": now,
        "updated_at": now,
        "approved_at": None,
        "personal": {
            "student_name": (student_name or "").strip() or None,
            "teacher_name": (teacher_name or "").strip() or None,
            "date": datetime.now().strftime("%d/%m/%Y"),
        },
        "how_is_your_voice": how,
        "positives": positives,
        "priorities": priorities,
        "exercises": exercises,
        "closing_message": closing,
        "teacher_observations": (teacher_observations or "").strip() or None,
        "source": {
            "analysis_version": analysis.get("analysis_version"),
            "mode": mode,
            "no_reference": no_ref,
            "event_count": len(events),
            "positive_count": len(positives_raw),
            "processing_engine": analysis.get("processing_engine"),
        },
        "disclaimer": (
            "Devolutiva pedagógica gerada a partir de medições acústicas observáveis. "
            "Não constitui diagnóstico clínico. Ocorrências 'possíveis' não são erros confirmados. "
            "Sem referência musical, não afirmamos desafinação absoluta em relação à melodia."
        ),
    }


def _how_is_your_voice(
    analysis: dict[str, Any],
    priorities: list[dict[str, str]],
    positives: list[dict[str, str]],
    *,
    no_ref: bool,
) -> str:
    if analysis.get("client_fallback"):
        return (
            "Esta análise veio do modo simplificado do navegador. "
            "Para uma devolutiva mais completa, rode novamente com o motor Python."
        )
    median = (analysis.get("observed_range") or {}).get("median_hz")
    valid = (analysis.get("statistics") or {}).get("valid_frame_percent")
    bits: list[str] = []
    if median is not None and valid is not None:
        bits.append(
            f"Nesta gravação, a altura típica observada ficou em torno de {median} Hz, "
            f"com cerca de {valid}% dos trechos com leitura confiável da voz."
        )
    if positives:
        bits.append(
            f"Destacamos {len(positives)} ponto(s) positivo(s) com evidência na análise."
        )
    if priorities:
        names = ", ".join(p["name"].lower() for p in priorities[:3])
        bits.append(f"Como prioridade de treino, sugerimos atenção a: {names}.")
    else:
        bits.append(
            "Não há prioridades de melhoria com evidência suficiente nesta gravação — "
            "isso pode acontecer em trechos estáveis ou curtos."
        )
    if no_ref:
        bits.append(
            "Como não houve referência musical nesta análise, "
            "não avaliamos se você desafinou em relação a uma melodia."
        )
    return " ".join(bits)


def _closing(priorities: list[dict[str, str]], positives: list[dict[str, str]]) -> str:
    if priorities:
        return (
            "Você já tem material concreto para treinar esta semana. "
            "Trabalhe com calma, sem forçar a voz, e grave de novo para comparar. "
            "Estamos juntos nessa evolução."
        )
    if positives:
        return (
            "Sua gravação já mostra pontos sólidos. "
            "Mantenha essa clareza e amplie aos poucos a extensão da prática. "
            "Parabéns pelo cuidado com a voz."
        )
    return (
        "Obrigado por gravar. Quando puder, envie um trecho um pouco mais longo "
        "em ambiente silencioso — assim a próxima devolutiva terá mais material. "
        "Cuide da voz e continue praticando."
    )
