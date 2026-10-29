/**
 * PDF da Devolutiva Vocal do Aluno — preferencialmente 1 página A4.
 * Independente do relatório técnico e do PDF pedagógico longo existente.
 */

import type { VoiceCheckDevolutiva } from "@/lib/voicecheck-devolutiva";
import { devolutivaPdfFilename } from "@/lib/voicecheck-devolutiva";
import { BRAND, esc, printHtmlDocument } from "@/lib/voicecheck-report-shared";

function css(): string {
  return `
    @page { size: A4; margin: 12mm 14mm 14mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: ${BRAND.ink};
      background: #fff;
      font-size: 10.5pt;
      line-height: 1.4;
      margin: 0;
    }
    .brand {
      font-size: 9pt; letter-spacing: 0.16em; text-transform: uppercase;
      color: ${BRAND.teal}; font-weight: 700;
    }
    h1 {
      font-size: 15pt; margin: 2pt 0 8pt; color: ${BRAND.ink};
      letter-spacing: -0.02em; border-bottom: 2.5pt solid ${BRAND.teal};
      padding-bottom: 6pt;
    }
    h2 {
      font-size: 11pt; color: ${BRAND.tealDark}; margin: 10pt 0 4pt;
      page-break-after: avoid;
    }
    .meta {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4pt 10pt;
      font-size: 9pt; color: ${BRAND.muted}; margin-bottom: 8pt;
    }
    .meta strong { color: ${BRAND.ink}; }
    .lead {
      background: #f0fdfa; border-left: 3.5pt solid ${BRAND.teal};
      padding: 8pt 10pt; border-radius: 0 6pt 6pt 0; margin: 0 0 6pt;
      font-size: 10pt;
    }
    .item {
      border: 1pt solid ${BRAND.line}; border-radius: 6pt;
      padding: 6pt 8pt; margin-bottom: 5pt; page-break-inside: avoid;
    }
    .item.pos { background: #ecfdf5; border-color: #a7f3d0; }
    .item.prio { background: #fffbeb; border-color: #fde68a; }
    .item.ex { background: #ecfeff; border-color: #a5f3fc; }
    .item h3 { margin: 0 0 2pt; font-size: 10pt; }
    .item p { margin: 2pt 0; font-size: 9pt; color: #334155; }
    .closing {
      margin-top: 8pt; padding: 8pt 10pt; border-radius: 6pt;
      background: ${BRAND.teal}; color: #fff; font-size: 10pt;
    }
    .obs {
      margin-top: 6pt; padding: 6pt 8pt; border: 1pt dashed ${BRAND.line};
      border-radius: 6pt; font-size: 9pt; color: ${BRAND.muted};
    }
    .sign {
      margin-top: 14pt; display: grid; grid-template-columns: 1fr 1fr; gap: 16pt;
      font-size: 9pt; color: ${BRAND.muted};
    }
    .sign .line { border-top: 1pt solid ${BRAND.line}; margin-top: 28pt; padding-top: 4pt; }
    .ftr {
      margin-top: 10pt; padding-top: 5pt; border-top: 1pt solid ${BRAND.line};
      font-size: 7.5pt; color: ${BRAND.muted};
    }
    .badge {
      display: inline-block; font-size: 8pt; padding: 2pt 7pt; border-radius: 999pt;
      background: #ccfbf1; color: ${BRAND.tealDark}; margin-left: 6pt;
    }
    .badge.ok { background: #d1fae5; color: #065f46; }
    .actions {
      position: sticky; top: 0; background: #fff; padding: 6pt 0; margin-bottom: 6pt;
      border-bottom: 1pt solid ${BRAND.line}; z-index: 2;
    }
    .actions button {
      background: ${BRAND.teal}; color: #fff; border: none; border-radius: 8pt;
      padding: 7pt 12pt; font-size: 10pt; cursor: pointer;
    }
    @media print { .actions { display: none; } }
  `;
}

export function buildDevolutivaReportHtml(d: VoiceCheckDevolutiva): string {
  const titleFile = devolutivaPdfFilename(d);
  const statusBadge =
    d.status === "approved"
      ? `<span class="badge ok">Aprovada</span>`
      : `<span class="badge">Rascunho</span>`;

  const positives =
    d.positives.length === 0
      ? `<p style="font-size:9pt;color:${BRAND.muted}">Nenhum ponto positivo com evidência suficiente nesta análise — não inventamos elogios.</p>`
      : d.positives
          .map(
            (p) =>
              `<div class="item pos"><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></div>`,
          )
          .join("");

  const priorities =
    d.priorities.length === 0
      ? `<p style="font-size:9pt;color:${BRAND.muted}">Sem prioridades de melhoria com evidência suficiente nesta gravação.</p>`
      : d.priorities
          .map(
            (p) =>
              `<div class="item prio"><h3>${esc(p.name)}</h3>` +
              `<p>${esc(p.explanation)}</p>` +
              `<p><strong>Orientação:</strong> ${esc(p.guidance)}</p></div>`,
          )
          .join("");

  const exercises =
    d.exercises.length === 0
      ? `<p style="font-size:9pt;color:${BRAND.muted}">Sem exercícios sugeridos — não há ocorrências vinculadas com orientação.</p>`
      : d.exercises
          .map(
            (e) =>
              `<div class="item ex"><h3>${esc(e.name)}</h3>` +
              `<p><strong>Como executar:</strong> ${esc(e.howTo)}</p>` +
              `<p><strong>Duração / repetições:</strong> ${esc(e.duration)}</p></div>`,
          )
          .join("");

  const obs = d.teacherObservations.trim()
    ? `<div class="obs"><strong>Observações do professor:</strong> ${esc(d.teacherObservations)}</div>`
    : "";

  const teacher = d.personal.teacherName.trim() || "________________";
  const student = d.personal.studentName.trim() || "________________";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${esc(titleFile.replace(/\.pdf$/i, ""))}</title>
  <style>${css()}</style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Salvar / imprimir PDF</button></div>
  <div class="brand">VoiceCheck IA${statusBadge}</div>
  <h1>Devolutiva Vocal</h1>
  <div class="meta">
    <div><strong>Aluno:</strong> ${esc(student)}</div>
    <div><strong>Professor:</strong> ${esc(teacher)}</div>
    <div><strong>Data:</strong> ${esc(d.personal.date)}</div>
  </div>

  <h2>1. Como está sua voz?</h2>
  <div class="lead">${esc(d.howIsYourVoice)}</div>

  <h2>2. Seus pontos positivos</h2>
  ${positives}

  <h2>3. O que precisamos melhorar?</h2>
  ${priorities}

  <h2>4. Seu treino para esta semana</h2>
  ${exercises}

  <h2>5. Mensagem final</h2>
  <div class="closing">${esc(d.closingMessage)}</div>
  ${obs}

  <div class="sign">
    <div class="line">Aluno(a)</div>
    <div class="line">${esc(d.personal.teacherName.trim() || "Professor(a)")}</div>
  </div>

  <div class="ftr">${esc(d.disclaimer)} · ${esc(d.devolutivaVersion)} · gerada ${esc(d.generatedAt.slice(0, 10))}</div>
</body>
</html>`;
}

export function printDevolutivaReport(d: VoiceCheckDevolutiva): void {
  printHtmlDocument(buildDevolutivaReportHtml(d));
}

export function openDevolutivaPreview(d: VoiceCheckDevolutiva): Window | null {
  if (typeof window === "undefined") return null;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) throw new Error("Popup bloqueado — permita janelas para visualizar.");
  w.document.open();
  w.document.write(buildDevolutivaReportHtml(d));
  w.document.close();
  return w;
}

export function openTechnicalPreview(html: string): Window | null {
  if (typeof window === "undefined") return null;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) throw new Error("Popup bloqueado — permita janelas para visualizar.");
  w.document.open();
  w.document.write(html);
  w.document.close();
  return w;
}
