/**
 * Fachada de exportação VoiceCheck — aluno / técnico / completo.
 * Não altera algoritmos; só apresenta a análise já calculada.
 */

import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";
import { buildStudentReportHtml } from "@/lib/voicecheck-report-student";
import {
  buildCompleteReportHtml,
  buildTeacherReportHtml,
} from "@/lib/voicecheck-report-teacher";
import {
  printHtmlDocument,
  type ReportKind,
  type VoiceCheckReportPersonalization,
} from "@/lib/voicecheck-report-shared";

/** @deprecated use VoiceCheckReportPersonalization */
export type VoiceCheckReportMeta = VoiceCheckReportPersonalization;

export type { ReportKind, VoiceCheckReportPersonalization };

export function buildVoiceCheckReportHtml(
  report: VoiceCheckF0Report,
  personal: VoiceCheckReportPersonalization = {},
  kind: ReportKind = "student",
): string {
  if (kind === "teacher") {
    return buildTeacherReportHtml(report, personal);
  }
  if (kind === "complete") {
    const student = buildStudentReportHtml(report, personal);
    const teacher = buildTeacherReportHtml(report, personal, {
      annexTitle: "Anexo técnico",
    });
    return buildCompleteReportHtml(report, personal, student, teacher);
  }
  return buildStudentReportHtml(report, personal);
}

/** Compat: padrão = relatório do aluno. */
export function printVoiceCheckReport(
  report: VoiceCheckF0Report,
  personal: VoiceCheckReportPersonalization = {},
  kind: ReportKind = "student",
): void {
  printHtmlDocument(buildVoiceCheckReportHtml(report, personal, kind));
}

export function printStudentReport(
  report: VoiceCheckF0Report,
  personal?: VoiceCheckReportPersonalization,
): void {
  printVoiceCheckReport(report, personal, "student");
}

export function printTeacherReport(
  report: VoiceCheckF0Report,
  personal?: VoiceCheckReportPersonalization,
): void {
  printVoiceCheckReport(report, personal, "teacher");
}

export function printCompleteReport(
  report: VoiceCheckF0Report,
  personal?: VoiceCheckReportPersonalization,
): void {
  printVoiceCheckReport(report, personal, "complete");
}
