/**
 * Camada pedagógica VoiceCheck — linguagem acessível + priorização.
 * Não altera medições; só apresenta e agrupa o que já veio da análise.
 */

import { formatClock } from "@/lib/stem-theme";
import type {
  VoiceCheckEvent,
  VoiceCheckF0Report,
  VoiceCheckPositive,
  VoiceCheckRecommendation,
} from "@/lib/voicecheck-f0-analysis";

export type PedagogyCategory =
  | "stability"
  | "continuity"
  | "breathing"
  | "dynamics"
  | "vibrato"
  | "phrasing"
  | "pitch_ref"
  | "other";

export type PrioritizedCluster = {
  category: PedagogyCategory;
  simpleName: string;
  count: number;
  /** Representante (melhor evidência) */
  lead: VoiceCheckEvent;
  samples: VoiceCheckEvent[];
  observed: string;
  mayMean: string;
  howToImprove: string;
  exercise: string | null;
  /** 0–1 score interno de prioridade pedagógica (não é % de certeza) */
  priorityScore: number;
};

type CatMeta = {
  simpleName: string;
  domain: PedagogyCategory;
  observed: string;
  mayMean: string;
  howToImprove: string;
};

const CAT_META: Record<string, CatMeta> = {
  possible_voice_break: {
    simpleName: "Possível interrupção da emissão",
    domain: "continuity",
    observed: "Houve uma pausa breve na continuidade do som em um trecho sustentado.",
    mayMean:
      "Pode ser dificuldade de passagem, articulação, respiração ou, em alguns casos, limitação da análise. Também pode ser escolha expressiva.",
    howToImprove:
      "Repita o trecho mais devagar, com menos pressão, e observe se a interrupção se repete.",
  },
  unstable_sustained_pitch: {
    simpleName: "Oscilações de altura na nota",
    domain: "stability",
    observed: "A altura da voz variou de forma irregular enquanto a nota era sustentada.",
    mayMean:
      "Pode indicar busca de apoio, cansaço ou vibrato irregular. Nem sempre é um “erro” — o contexto musical importa.",
    howToImprove:
      "Pratique sustentar a nota em volume confortável, com intenção clara da altura central.",
  },
  irregular_pitch_modulation: {
    simpleName: "Oscilações irregulares de altura",
    domain: "vibrato",
    observed: "A altura oscilou sem um padrão periódico claro de vibrato.",
    mayMean: "Pode ser portamento, instabilidade ou ruído na estimativa da análise.",
    howToImprove: "Isole o trecho e cante com menos movimento, depois reintroduza a expressão.",
  },
  regular_vibrato: {
    simpleName: "Vibrato regular observado",
    domain: "vibrato",
    observed: "Foi detectada uma oscilação periódica compatível com vibrato.",
    mayMean: "Característica expressiva — não é automaticamente um problema.",
    howToImprove: "Se o objetivo for vibrato controlado, pratique taxa e amplitude conscientemente.",
  },
  abrupt_intensity_drop: {
    simpleName: "Redução repentina da intensidade",
    domain: "dynamics",
    observed: "O volume caiu de forma abrupta em um trecho com atividade vocal.",
    mayMean: "Pode ser dinâmica intencional, falta de apoio ou mudança de microfone/distância.",
    howToImprove: "Ouça o trecho e pratique manter o volume estável, se essa for a intenção.",
  },
  possible_clipping: {
    simpleName: "Possível saturação na gravação",
    domain: "dynamics",
    observed: "Amostras próximas do limite digital — risco de distorção.",
    mayMean: "Ganho alto do microfone/interface; prejudica a análise e a escuta.",
    howToImprove: "Regrave com ganho menor (pico em torno de −6 dB) e distância estável do mic.",
  },
  possible_audible_breath: {
    simpleName: "Possível respiração audível",
    domain: "breathing",
    observed: "Intervalo curto entre frases com energia residual, sem altura clara.",
    mayMean: "Pode ser inspiração audível — ou ruído ambiente. Heurística, não certeza.",
    howToImprove: "Pratique respirar um pouco antes do fim da frase e reduzir o fluxo na tomada de ar.",
  },
  phrase_pause: {
    simpleName: "Pausa entre frases",
    domain: "phrasing",
    observed: "Houve um intervalo sem emissão clara entre duas regiões cantadas.",
    mayMean: "Pausa musical normal ou respiração. Só merece atenção se for indesejada.",
    howToImprove: "Marque as frases na partitura e alinhe as respirações com o sentido musical.",
  },
  phrase_micro_gap: {
    simpleName: "Microinterrupção de frase",
    domain: "phrasing",
    observed: "Pequena descontinuidade entre regiões vozeadas.",
    mayMean: "Articulação, respiração rápida ou perda breve de continuidade.",
    howToImprove: "Pratique legato conectando as duas regiões com uma vogal contínua.",
  },
  pitch_below_reference: {
    simpleName: "Altura abaixo da referência",
    domain: "pitch_ref",
    observed: "Em relação à referência, a nota ficou mais grave do que o esperado.",
    mayMean: "Desvio de afinação ou transposição não aceita no alinhamento.",
    howToImprove: "Ouça a referência e repita o trecho lentamente, estabilizando a altura.",
  },
  pitch_above_reference: {
    simpleName: "Altura acima da referência",
    domain: "pitch_ref",
    observed: "Em relação à referência, a nota ficou mais aguda do que o esperado.",
    mayMean: "Desvio de afinação ou tensão excessiva.",
    howToImprove: "Compare com a referência e ajuste gradualmente, sem forçar o volume.",
  },
};

const DOMAIN_LABEL: Record<PedagogyCategory, string> = {
  stability: "Estabilidade",
  continuity: "Continuidade da emissão",
  breathing: "Respiração",
  dynamics: "Dinâmica (intensidade)",
  vibrato: "Vibrato / oscilação",
  phrasing: "Fraseado",
  pitch_ref: "Afinação (com referência)",
  other: "Outros pontos observados",
};

function metaFor(ev: VoiceCheckEvent): CatMeta {
  return (
    CAT_META[ev.category] ?? {
      simpleName: ev.title || "Ponto observado",
      domain: "other",
      observed: ev.description,
      mayMean:
        "Merece escuta atenta. Pode ser característica artística, necessidade técnica ou limitação da análise.",
      howToImprove: ev.guidance || "Ouça o trecho e repita com intenção clara.",
    }
  );
}

function evidenceQuality(ev: VoiceCheckEvent): number {
  // Usa confiança só como peso relativo interno — não exibir como % de certeza ao aluno
  const c = ev.confidence;
  if (c == null || !Number.isFinite(c)) return 0.45;
  return Math.max(0.2, Math.min(0.95, c));
}

function overlap(a: VoiceCheckEvent, b: VoiceCheckEvent): boolean {
  return a.start_seconds < b.end_seconds && b.start_seconds < a.end_seconds;
}

/** Remove sobreposições da mesma categoria (mantém a de melhor evidência). */
export function dedupeOverlapping(events: VoiceCheckEvent[]): VoiceCheckEvent[] {
  const byCat = new Map<string, VoiceCheckEvent[]>();
  for (const ev of events) {
    const list = byCat.get(ev.category) ?? [];
    list.push(ev);
    byCat.set(ev.category, list);
  }
  const out: VoiceCheckEvent[] = [];
  for (const list of byCat.values()) {
    const sorted = [...list].sort((a, b) => evidenceQuality(b) - evidenceQuality(a));
    const kept: VoiceCheckEvent[] = [];
    for (const ev of sorted) {
      if (kept.some((k) => overlap(k, ev))) continue;
      kept.push(ev);
    }
    out.push(...kept);
  }
  return out.sort((a, b) => a.start_seconds - b.start_seconds);
}

export function prioritizeClusters(events: VoiceCheckEvent[]): PrioritizedCluster[] {
  const cleaned = dedupeOverlapping(events).filter((e) => {
    // vibrato regular é informativo, não prioridade de “melhoria”
    return e.category !== "regular_vibrato";
  });

  const groups = new Map<string, VoiceCheckEvent[]>();
  for (const ev of cleaned) {
    const m = metaFor(ev);
    const key = `${m.domain}::${m.simpleName}`;
    const list = groups.get(key) ?? [];
    list.push(ev);
    groups.set(key, list);
  }

  const clusters: PrioritizedCluster[] = [];
  for (const [, list] of groups) {
    const lead = [...list].sort((a, b) => evidenceQuality(b) - evidenceQuality(a))[0]!;
    const m = metaFor(lead);
    const dur =
      list.reduce((s, e) => s + Math.max(0.05, e.end_seconds - e.start_seconds), 0) /
      Math.max(1, list.length);
    const priorityScore =
      0.35 * evidenceQuality(lead) +
      0.25 * Math.min(1, list.length / 8) +
      0.2 * Math.min(1, dur / 0.4) +
      0.2 * (m.domain === "continuity" || m.domain === "stability" ? 1 : 0.6);

    clusters.push({
      category: m.domain,
      simpleName: m.simpleName,
      count: list.length,
      lead,
      samples: [...list].sort((a, b) => a.start_seconds - b.start_seconds).slice(0, 5),
      observed: m.observed,
      mayMean: m.mayMean,
      howToImprove: lead.guidance || m.howToImprove,
      exercise: lead.exercise || null,
      priorityScore,
    });
  }

  return clusters.sort((a, b) => b.priorityScore - a.priorityScore);
}

export type TrainingExercise = {
  id: string;
  title: string;
  objective: string;
  excerpt: string;
  steps: string[];
  durationMin: number;
  repetitions: number;
  tracking: string;
  care: string;
};

export function buildTrainingPlan(
  clusters: PrioritizedCluster[],
  recommendations: VoiceCheckRecommendation[],
): TrainingExercise[] {
  const top = clusters.slice(0, 5);
  const byKey = new Map(recommendations.map((r) => [r.key, r]));

  return top.map((c, i) => {
    const rec = c.lead.recommendation_key
      ? byKey.get(c.lead.recommendation_key)
      : undefined;
    const times = c.samples.map((s) => formatClock(s.start_seconds)).join(", ");
    return {
      id: `ex_${i}_${c.lead.id}`,
      title: c.simpleName,
      objective: c.howToImprove,
      excerpt:
        times.length > 0
          ? `Trechos em torno de: ${times}${c.count > c.samples.length ? ` (+${c.count - c.samples.length})` : ""}`
          : "Trecho a definir na escuta da gravação",
      steps: [
        "Ouça o trecho destacado na gravação.",
        "Repita em tempo lento, volume confortável.",
        c.exercise || rec?.exercise || "Isole 2–4 compassos e faça loop curto.",
        "Grave novamente o mesmo trecho para comparar.",
      ],
      durationMin: 5,
      repetitions: 4,
      tracking: "O trecho ficou mais estável ou confortável na nova gravação?",
      care: "Pare se houver desconforto. Não force volume nem extensão.",
    };
  });
}

export type VoiceDomainExplainer = {
  title: string;
  available: boolean;
  plain: string;
  detail: string | null;
};

export function explainMyVoice(report: VoiceCheckF0Report): VoiceDomainExplainer[] {
  const events = report.events ?? [];
  const has = (pred: (e: VoiceCheckEvent) => boolean) => events.some(pred);
  const stab = report.statistics.stable_region_variation_cents_median;
  const hasRef = report.no_reference === false || report.mode === "with_reference";

  return [
    {
      title: "Afinação",
      available: hasRef || has((e) => e.category.startsWith("pitch_")),
      plain: hasRef
        ? "Com referência musical, comparamos sua altura às notas esperadas."
        : "Sem referência nesta análise — não marcamos “certo/errado” de afinação absoluta. Usamos a altura observada (F0) só como descrição.",
      detail: hasRef
        ? "Veja ocorrências de altura acima/abaixo da referência no relatório técnico."
        : null,
    },
    {
      title: "Estabilidade",
      available: stab != null || has((e) => e.category === "unstable_sustained_pitch"),
      plain:
        stab != null
          ? `Nas regiões sustentadas, a variação típica observada foi de cerca de ${stab} cents (unidade de altura). Valores mais altos sugerem mais oscilação.`
          : "Não houve trecho sustentado suficiente para descrever estabilidade.",
      detail: null,
    },
    {
      title: "Continuidade",
      available:
        (report.analyzable_regions?.length ?? 0) > 0 ||
        has((e) => e.category === "possible_voice_break"),
      plain: has((e) => e.category === "possible_voice_break")
        ? "Foram observados trechos com possível interrupção breve da emissão."
        : "A emissão apareceu contínua nas regiões analisáveis, sem interrupções breves que atendessem aos critérios da análise.",
      detail: null,
    },
    {
      title: "Respiração e fraseado",
      available: has(
        (e) =>
          e.category === "possible_audible_breath" ||
          e.category === "phrase_pause" ||
          e.category === "phrase_micro_gap",
      ),
      plain: has((e) => e.category === "possible_audible_breath")
        ? "Há trechos compatíveis com respiração audível entre frases (heurística)."
        : has((e) => e.category.startsWith("phrase_"))
          ? "Há pausas ou microinterrupções entre frases — podem ser musicais ou técnicas."
          : "Não destacamos eventos de respiração/fraseado com evidência suficiente.",
      detail: null,
    },
    {
      title: "Dinâmica",
      available: has(
        (e) => e.category === "abrupt_intensity_drop" || e.category === "possible_clipping",
      ),
      plain: has((e) => e.category === "possible_clipping")
        ? "Há indício de saturação na gravação — vale ajustar o ganho."
        : has((e) => e.category === "abrupt_intensity_drop")
          ? "Há quedas rápidas de intensidade em trechos com voz."
          : "Sem eventos de dinâmica destacados nesta análise.",
      detail: null,
    },
    {
      title: "Vibrato",
      available: has(
        (e) =>
          e.category === "regular_vibrato" || e.category === "irregular_pitch_modulation",
      ),
      plain: has((e) => e.category === "regular_vibrato")
        ? "Há trechos com oscilação periódica compatível com vibrato (característica, não erro)."
        : has((e) => e.category === "irregular_pitch_modulation")
          ? "Há oscilação de altura sem padrão claro de vibrato."
          : "Sem caracterização de vibrato nesta análise.",
      detail: null,
    },
  ];
}

export function simpleSummary(report: VoiceCheckF0Report, clusters: PrioritizedCluster[]): string {
  const pos = report.positive_findings?.length ?? 0;
  const n = clusters.reduce((s, c) => s + c.count, 0);
  if (report.client_fallback) {
    return "Esta análise veio do modo simplificado do navegador. Para uma devolutiva completa com ocorrências, rode de novo com o motor Python.";
  }
  if (n === 0 && pos === 0) {
    return "Nesta gravação não destacamos ocorrências técnicas com evidência suficiente nem pontos positivos calibrados. Isso pode acontecer em trechos curtos, muito estáveis ou com pouca voz detectada.";
  }
  if (n === 0) {
    return `Observamos ${pos} ponto(s) positivo(s) com evidência. Não há prioridades de desenvolvimento destacadas com os critérios atuais — continue praticando com intenção clara.`;
  }
  const tops = clusters
    .slice(0, 3)
    .map((c) => c.simpleName.toLowerCase())
    .join(", ");
  return `Sua gravação foi analisada com foco em características acústicas observáveis. Destacamos ${pos} ponto(s) positivo(s) e prioridades em: ${tops}. Use os exercícios do plano para trabalhar esses trechos com calma.`;
}

export function nextGoal(clusters: PrioritizedCluster[], positives: VoiceCheckPositive[]): string {
  if (clusters[0]) {
    return `Próximo objetivo: melhorar “${clusters[0].simpleName}” nos trechos indicados, gravando de novo para comparar.`;
  }
  if (positives.length) {
    return "Próximo objetivo: manter os pontos positivos e ampliar a extensão da prática com a mesma clareza.";
  }
  return "Próximo objetivo: gravar um trecho um pouco mais longo, em ambiente silencioso, para a análise ter mais material.";
}

export { DOMAIN_LABEL, formatClock };
