/**
 * Devolutiva Vocal do Aluno — interpretação pedagógica do JSON de análise.
 * Offline, sem DSP, sem inventar ocorrências.
 */

import type {
  VoiceCheckEvent,
  VoiceCheckF0Report,
  VoiceCheckPositive,
} from "@/lib/voicecheck-f0-analysis";
import {
  buildTrainingPlan,
  prioritizeClusters,
  simpleSummary,
} from "@/lib/voicecheck-report-pedagogy";

export const DEVOLUTIVA_VERSION = "voicecheck_devolutiva_v1";

export type DevolutivaStatus = "draft" | "approved";

export type DevolutivaPositive = { title: string; text: string };
export type DevolutivaPriority = {
  name: string;
  explanation: string;
  guidance: string;
};
export type DevolutivaExercise = {
  name: string;
  howTo: string;
  duration: string;
};

export type VoiceCheckDevolutiva = {
  id: string;
  devolutivaVersion: typeof DEVOLUTIVA_VERSION;
  status: DevolutivaStatus;
  generatedAt: string;
  updatedAt: string;
  approvedAt: string | null;
  analysisFingerprint: string;
  personal: {
    studentName: string;
    teacherName: string;
    date: string;
  };
  howIsYourVoice: string;
  positives: DevolutivaPositive[];
  priorities: DevolutivaPriority[];
  exercises: DevolutivaExercise[];
  closingMessage: string;
  teacherObservations: string;
  source: {
    analysisVersion?: string;
    mode?: string;
    noReference: boolean;
    eventCount: number;
    positiveCount: number;
    processingEngine?: string;
  };
  disclaimer: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dev_${Date.now()}`;
}

export function analysisFingerprint(report: VoiceCheckF0Report): string {
  const ev = (report.events ?? [])
    .map((e) => `${e.id}:${e.category}:${e.start_seconds}`)
    .join("|");
  const pos = (report.positive_findings ?? []).map((p) => p.id || p.key).join("|");
  return `${report.analysis_version}|${report.mode}|${report.no_reference}|${report.duration_seconds}|${ev}|${pos}`;
}

function formatDatePt(d = new Date()): string {
  return d.toLocaleDateString("pt-BR");
}

function isPitchWithoutRef(ev: VoiceCheckEvent, noRef: boolean): boolean {
  return noRef && String(ev.category || "").startsWith("pitch_");
}

export function buildDevolutivaFromReport(
  report: VoiceCheckF0Report,
  opts?: {
    studentName?: string | null;
    teacherName?: string | null;
    teacherObservations?: string | null;
    existingId?: string;
  },
): VoiceCheckDevolutiva {
  const noRef = report.no_reference !== false && report.mode !== "with_reference";
  const events = (report.events ?? []).filter(
    (e) =>
      e.category !== "regular_vibrato" &&
      e.category !== "melodic_consistency_variation" &&
      !isPitchWithoutRef(e, noRef),
  );
  const clusters = prioritizeClusters(events).slice(0, 3);
  const positivesSrc = (report.positive_findings ?? []).slice(0, 3);
  const plan = buildTrainingPlan(clusters, report.recommendations ?? []).slice(0, 3);

  const priorities: DevolutivaPriority[] = clusters.map((c) => ({
    name: c.simpleName,
    explanation: `${c.observed} ${c.mayMean}`,
    guidance: c.howToImprove,
  }));

  const positives: DevolutivaPositive[] = positivesSrc.map((p: VoiceCheckPositive) => ({
    title: p.title,
    text: p.description,
  }));

  const exercises: DevolutivaExercise[] = plan.map((ex) => ({
    name: ex.title,
    howTo: ex.steps.join(" "),
    duration: `${ex.repetitions} repetições · ~${ex.durationMin} min`,
  }));

  // Completa com recommendations se faltarem exercícios
  for (const r of report.recommendations ?? []) {
    if (exercises.length >= 3) break;
    if (!r.exercise) continue;
    if (exercises.some((e) => e.name === r.title)) continue;
    exercises.push({
      name: r.title,
      howTo: r.exercise,
      duration: "5 minutos",
    });
  }

  const how =
    simpleSummary(report, clusters) +
    (noRef
      ? " Como não houve referência musical nesta análise, não afirmamos desafinação em relação a uma melodia."
      : "");

  const closing = buildClosing(priorities, positives);
  const now = new Date().toISOString();

  return {
    id: opts?.existingId ?? newId(),
    devolutivaVersion: DEVOLUTIVA_VERSION,
    status: "draft",
    generatedAt: now,
    updatedAt: now,
    approvedAt: null,
    analysisFingerprint: analysisFingerprint(report),
    personal: {
      studentName: (opts?.studentName ?? "").trim(),
      teacherName: (opts?.teacherName ?? "").trim(),
      date: formatDatePt(),
    },
    howIsYourVoice: how,
    positives,
    priorities,
    exercises,
    closingMessage: closing,
    teacherObservations: (opts?.teacherObservations ?? "").trim(),
    source: {
      analysisVersion: report.analysis_version,
      mode: report.mode,
      noReference: noRef,
      eventCount: report.events?.length ?? 0,
      positiveCount: report.positive_findings?.length ?? 0,
      processingEngine: report.processing_engine,
    },
    disclaimer:
      "Devolutiva pedagógica gerada a partir de medições acústicas observáveis. " +
      "Não constitui diagnóstico clínico. Ocorrências 'possíveis' não são erros confirmados. " +
      "Sem referência musical, não afirmamos desafinação absoluta em relação à melodia.",
  };
}

function buildClosing(
  priorities: DevolutivaPriority[],
  positives: DevolutivaPositive[],
): string {
  if (priorities.length) {
    return (
      "Você já tem material concreto para treinar esta semana. " +
      "Trabalhe com calma, sem forçar a voz, e grave de novo para comparar. " +
      "Estamos juntos nessa evolução."
    );
  }
  if (positives.length) {
    return (
      "Sua gravação já mostra pontos sólidos. " +
      "Mantenha essa clareza e amplie aos poucos a extensão da prática. " +
      "Parabéns pelo cuidado com a voz."
    );
  }
  return (
    "Obrigado por gravar. Quando puder, envie um trecho um pouco mais longo " +
    "em ambiente silencioso — assim a próxima devolutiva terá mais material. " +
    "Cuide da voz e continue praticando."
  );
}

export function approveDevolutiva(d: VoiceCheckDevolutiva): VoiceCheckDevolutiva {
  const now = new Date().toISOString();
  return { ...d, status: "approved", approvedAt: now, updatedAt: now };
}

export function touchDevolutiva(d: VoiceCheckDevolutiva): VoiceCheckDevolutiva {
  return { ...d, updatedAt: new Date().toISOString(), status: "draft", approvedAt: null };
}

/** Sugestão de nome de arquivo PDF (o diálogo do navegador usa o <title>). */
export function devolutivaPdfFilename(d: VoiceCheckDevolutiva): string {
  const aluno = (d.personal.studentName || "Aluno").replace(/[^\w\-]+/g, "_").slice(0, 40);
  const data = (d.personal.date || "").replace(/\//g, "-");
  return `VoiceCheck_Devolutiva_Vocal_${aluno}_${data}.pdf`;
}

export function technicalPdfFilename(studentName?: string | null, date = new Date()): string {
  const aluno = (studentName || "Aluno").replace(/[^\w\-]+/g, "_").slice(0, 40);
  const data = date.toLocaleDateString("pt-BR").replace(/\//g, "-");
  return `VoiceCheck_Relatorio_Tecnico_${aluno}_${data}.pdf`;
}
