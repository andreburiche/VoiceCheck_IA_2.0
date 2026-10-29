/**
 * Relatório técnico do professor — medições, gráficos detalhados, termos originais.
 * Mesma análise do aluno; sem reprocessar DSP.
 */

import { formatClock } from "@/lib/stem-theme";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";
import {
  svgCategoryBars,
  svgNoteHistogram,
  svgPitchContour,
  svgRmsEnvelope,
} from "@/lib/voicecheck-report-charts";
import { dedupeOverlapping } from "@/lib/voicecheck-report-pedagogy";
import {
  BRAND,
  esc,
  omitEmpty,
  type VoiceCheckReportPersonalization,
} from "@/lib/voicecheck-report-shared";

function teacherCss(): string {
  return `
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: ${BRAND.ink}; background: #fff; font-size: 9.5pt; line-height: 1.4; margin: 0;
    }
    h1 { font-size: 15pt; margin: 0 0 4pt; }
    h2 {
      font-size: 11pt; color: ${BRAND.tealDark}; margin: 12pt 0 6pt;
      border-bottom: 1.5pt solid ${BRAND.teal}; padding-bottom: 3pt; page-break-after: avoid;
    }
    .meta {
      display: grid; grid-template-columns: 1fr 1fr; gap: 2pt 12pt;
      background: ${BRAND.paper}; border: 1pt solid ${BRAND.line};
      border-radius: 6pt; padding: 8pt 10pt; font-size: 8.5pt; color: ${BRAND.muted}; margin-bottom: 8pt;
    }
    .meta strong { color: ${BRAND.ink}; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5pt; margin: 8pt 0; }
    .stat { border: 1pt solid ${BRAND.line}; border-radius: 5pt; padding: 5pt 7pt; }
    .stat .lbl { font-size: 7pt; text-transform: uppercase; color: ${BRAND.muted}; }
    .stat .val { font-family: ui-monospace, Consolas, monospace; font-size: 10pt; }
    .chart { margin: 6pt 0; page-break-inside: avoid; }
    .chart svg { max-width: 100%; height: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 4pt 0 8pt; }
    th, td { border-bottom: 1pt solid ${BRAND.line}; padding: 3pt 5pt; text-align: left; vertical-align: top; }
    th { color: ${BRAND.muted}; font-size: 7.5pt; text-transform: uppercase; }
    .mono { font-family: ui-monospace, Consolas, monospace; font-size: 8pt; color: ${BRAND.teal}; }
    .card { border: 1pt solid ${BRAND.line}; border-radius: 5pt; padding: 6pt 8pt; margin-bottom: 5pt; page-break-inside: avoid; }
    .muted { color: ${BRAND.muted}; font-size: 8pt; }
    .ftr { margin-top: 12pt; padding-top: 6pt; border-top: 1pt solid ${BRAND.line}; font-size: 7.5pt; color: ${BRAND.muted}; }
    .actions { margin-bottom: 8pt; }
    .actions button {
      background: ${BRAND.teal}; color: #fff; border: none; border-radius: 6pt;
      padding: 7pt 12pt; font-size: 10pt; cursor: pointer;
    }
    @media print { .actions { display: none; } }
  `;
}

export function buildTeacherReportHtml(
  report: VoiceCheckF0Report,
  personal: VoiceCheckReportPersonalization = {},
  opts?: { annexTitle?: string },
): string {
  const events = dedupeOverlapping(report.events ?? []);
  const positives = report.positive_findings ?? [];
  const recs = report.recommendations ?? [];
  const when = (personal.generatedAt ?? new Date()).toLocaleString("pt-BR");
  const student = personal.studentName?.trim() || "Aluno(a)";
  const asset = personal.assetName?.trim() || "Gravação";
  const title = opts?.annexTitle ?? "Relatório técnico — professor";

  const eventRows = events
    .slice(0, 60)
    .map(
      (ev) => `<tr>
      <td class="mono">${esc(formatClock(ev.start_seconds))}–${esc(formatClock(ev.end_seconds))}</td>
      <td>${esc(ev.category)}</td>
      <td>${esc(ev.title || "—")}</td>
      <td>${esc(ev.description)}</td>
      <td>${ev.confidence != null ? ev.confidence.toFixed(2) : "—"}</td>
    </tr>`,
    )
    .join("");

  const more =
    events.length > 60
      ? `<p class="muted">Exibindo 60 de ${events.length} ocorrências (após deduplicação temporal).</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>VoiceCheck — ${esc(title)} — ${esc(student)}</title>
  <style>${teacherCss()}</style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Salvar PDF técnico</button></div>
  <h1>${esc(title)}</h1>
  <p class="muted">Anexo técnico com categorias e parâmetros originais da análise. Mesma medição do relatório do aluno.</p>
  <div class="meta">
    ${omitEmpty("Aluno(a)", student)}
    ${omitEmpty("Professor(a)", personal.teacherName)}
    <div><strong>Data:</strong> ${esc(when)}</div>
    <div><strong>Arquivo:</strong> ${esc(asset)}</div>
    <div><strong>Motor:</strong> ${esc(report.processing_engine ?? report.algorithm)} · ${esc(report.analysis_version)}</div>
    <div><strong>Modo:</strong> ${esc(report.mode ?? (report.no_reference ? "without_reference" : "with_reference"))}</div>
    <div><strong>Sample rate:</strong> ${report.sample_rate} Hz · <strong>Duração:</strong> ${esc(formatClock(report.duration_seconds))}</div>
    <div><strong>Parâmetros:</strong> <span class="mono">${esc(JSON.stringify(report.parameters ?? {}))}</span></div>
  </div>

  <div class="summary">
    <div class="stat"><div class="lbl">Mediana F0</div><div class="val">${report.observed_range.median_hz ?? "—"}</div></div>
    <div class="stat"><div class="lbl">Valid %</div><div class="val">${report.statistics.valid_frame_percent}</div></div>
    <div class="stat"><div class="lbl">Span st</div><div class="val">${report.observed_range.span_semitones ?? "—"}</div></div>
    <div class="stat"><div class="lbl">Events</div><div class="val">${events.length}</div></div>
    <div class="stat"><div class="lbl">Positives</div><div class="val">${positives.length}</div></div>
  </div>

  <h2>Gráficos técnicos</h2>
  <div class="chart">${svgPitchContour(report, events)}</div>
  <div class="chart">${svgRmsEnvelope(report)}</div>
  <div class="chart">${svgCategoryBars(events)}</div>
  <div class="chart">${svgNoteHistogram(report.statistics.note_histogram ?? {})}</div>

  <h2>Ocorrências (contrato JSON)</h2>
  ${more}
  <table>
    <thead><tr><th>Tempo</th><th>category</th><th>title</th><th>description</th><th>conf*</th></tr></thead>
    <tbody>${eventRows || `<tr><td colspan="5">Nenhuma ocorrência</td></tr>`}</tbody>
  </table>
  <p class="muted">* Valor de confiança do detector (peso relativo interno). Não interpretar como porcentagem de certeza clínica.</p>

  <h2>Pontos positivos</h2>
  ${
    positives.length === 0
      ? `<p class="muted">Nenhum</p>`
      : positives
          .map(
            (p) => `<div class="card"><strong>${esc(p.title)}</strong>
        <div class="muted">${esc(p.key)}</div><p>${esc(p.description)}</p></div>`,
          )
          .join("")
  }

  <h2>Recommendations keys</h2>
  ${
    recs.length === 0
      ? `<p class="muted">Nenhuma</p>`
      : recs
          .map(
            (r) => `<div class="card"><strong>${esc(r.key)}</strong> — ${esc(r.title)}
        <p>${esc(r.text)}</p></div>`,
          )
          .join("")
  }

  ${
    report.warnings?.length
      ? `<h2>Warnings</h2><ul>${report.warnings.map((w) => `<li class="muted">${esc(w)}</li>`).join("")}</ul>`
      : ""
  }

  <div class="ftr">
    ${esc(report.disclaimer)}
    <br/>VoiceCheck IA · relatório técnico para professor.
    Não incluir diagnóstico clínico. Sem URLs de desenvolvimento.
  </div>
</body>
</html>`;
}

function extractTag(html: string, tag: "style" | "body"): string {
  const re =
    tag === "style"
      ? /<style[^>]*>([\s\S]*?)<\/style>/i
      : /<body[^>]*>([\s\S]*?)<\/body>/i;
  const m = html.match(re);
  return m?.[1] ?? "";
}

/** PDF completo = aluno + anexo técnico (estilos de ambos preservados). */
export function buildCompleteReportHtml(
  _report: VoiceCheckF0Report,
  _personal: VoiceCheckReportPersonalization,
  studentHtml: string,
  teacherHtml: string,
): string {
  const studentStyle = extractTag(studentHtml, "style");
  const teacherStyle = extractTag(teacherHtml, "style");
  let studentBody = extractTag(studentHtml, "body").replace(
    /<div class="actions">[\s\S]*?<\/div>/,
    "",
  );
  let teacherBody = extractTag(teacherHtml, "body").replace(
    /<div class="actions">[\s\S]*?<\/div>/,
    "",
  );

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>VoiceCheck — Relatório completo</title>
  <style>
    ${studentStyle}
    ${teacherStyle}
    .annex-divider {
      page-break-before: always;
      padding: 18pt 0 10pt;
      margin-top: 8pt;
      border-top: 3pt solid ${BRAND.teal};
      font-size: 12pt;
      color: ${BRAND.tealDark};
      font-weight: 700;
    }
    .actions-top {
      position: sticky; top: 0; z-index: 3; background: #fff;
      padding: 8pt 0; margin-bottom: 8pt; border-bottom: 1pt solid ${BRAND.line};
    }
    .actions-top button {
      background: ${BRAND.teal}; color: #fff; border: none; border-radius: 6pt;
      padding: 8pt 14pt; cursor: pointer; font-size: 10.5pt;
    }
    @media print { .actions-top { display: none; } }
  </style>
</head>
<body>
  <div class="actions-top">
    <button type="button" onclick="window.print()">Salvar PDF completo (aluno + técnico)</button>
  </div>
  ${studentBody}
  <div class="annex-divider">Anexo — Relatório técnico do professor</div>
  ${teacherBody}
</body>
</html>`;
}
