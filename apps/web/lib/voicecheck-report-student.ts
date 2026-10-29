/**
 * Relatório pedagógico do aluno — 5 páginas A4.
 * Linguagem acessível; dados da mesma análise (sem reinventar DSP).
 */

import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";
import {
  buildTrainingPlan,
  explainMyVoice,
  nextGoal,
  prioritizeClusters,
  simpleSummary,
  formatClock,
} from "@/lib/voicecheck-report-pedagogy";
import {
  BRAND,
  esc,
  omitEmpty,
  type VoiceCheckReportPersonalization,
} from "@/lib/voicecheck-report-shared";
import { svgCategoryBars } from "@/lib/voicecheck-report-charts";

function studentCss(): string {
  return `
    @page { size: A4; margin: 14mm 14mm 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: ${BRAND.ink};
      background: #fff;
      font-size: 11pt;
      line-height: 1.45;
      margin: 0;
    }
    .page { page-break-after: always; padding-bottom: 4mm; }
    .page:last-child { page-break-after: auto; }
    .hdr {
      display: flex; justify-content: space-between; align-items: flex-end;
      border-bottom: 2.5pt solid ${BRAND.teal};
      padding-bottom: 6pt; margin-bottom: 12pt;
    }
    .brand { font-size: 9pt; letter-spacing: 0.14em; text-transform: uppercase; color: ${BRAND.teal}; font-weight: 700; }
    .hdr h1 { font-size: 16pt; margin: 2pt 0 0; color: ${BRAND.ink}; letter-spacing: -0.02em; }
    .page-num { font-size: 9pt; color: ${BRAND.muted}; }
    .ftr {
      margin-top: 14pt; padding-top: 6pt; border-top: 1pt solid ${BRAND.line};
      font-size: 8pt; color: ${BRAND.muted};
    }
    h2 { font-size: 13pt; color: ${BRAND.tealDark}; margin: 0 0 8pt; }
    h3 { font-size: 11pt; color: ${BRAND.ink}; margin: 12pt 0 6pt; }
    .meta {
      display: grid; grid-template-columns: 1fr 1fr; gap: 3pt 14pt;
      background: ${BRAND.paper}; border: 1pt solid ${BRAND.line};
      border-radius: 8pt; padding: 10pt 12pt; font-size: 9.5pt; color: ${BRAND.muted};
      margin-bottom: 12pt;
    }
    .meta strong { color: ${BRAND.ink}; }
    .lead {
      background: #f0fdfa; border-left: 4pt solid ${BRAND.teal};
      padding: 10pt 12pt; border-radius: 0 8pt 8pt 0; margin: 10pt 0;
      font-size: 10.5pt;
    }
    .card {
      border: 1pt solid ${BRAND.line}; border-radius: 8pt;
      padding: 9pt 11pt; margin-bottom: 8pt; page-break-inside: avoid;
      background: ${BRAND.card};
    }
    .card.pos { border-color: #a7f3d0; background: #ecfdf5; }
    .card.prio { border-color: #fde68a; background: #fffbeb; }
    .card.ex { border-color: #a5f3fc; background: #ecfeff; }
    .card h4 { margin: 0 0 4pt; font-size: 11pt; }
    .card p { margin: 3pt 0; font-size: 9.5pt; color: #334155; }
    .tag {
      display: inline-block; font-size: 8pt; padding: 2pt 7pt; border-radius: 999pt;
      background: #ccfbf1; color: ${BRAND.tealDark}; margin-bottom: 4pt;
    }
    .tag.warn { background: #fef3c7; color: #92400e; }
    .tag.ok { background: #d1fae5; color: #065f46; }
    .time { font-family: ui-monospace, Consolas, monospace; font-size: 9pt; color: ${BRAND.teal}; }
    .muted { color: ${BRAND.muted}; font-size: 9pt; }
    .goal {
      margin-top: 10pt; padding: 10pt 12pt; border-radius: 8pt;
      background: ${BRAND.teal}; color: #fff; font-size: 10.5pt;
    }
    .chart { margin: 8pt 0; page-break-inside: avoid; }
    .chart svg { max-width: 100%; height: auto; }
    ol.steps { margin: 4pt 0 4pt 18pt; padding: 0; font-size: 9.5pt; }
    ol.steps li { margin: 2pt 0; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
    .domain { page-break-inside: avoid; }
    .actions {
      position: sticky; top: 0; background: #fff; padding: 8pt 0; margin-bottom: 8pt;
      border-bottom: 1pt solid ${BRAND.line}; z-index: 2;
    }
    .actions button {
      background: ${BRAND.teal}; color: #fff; border: none; border-radius: 8pt;
      padding: 8pt 14pt; font-size: 10.5pt; cursor: pointer;
    }
    @media print { .actions { display: none; } }
  `;
}

function header(title: string, page: number, total: number): string {
  return `<div class="hdr">
    <div>
      <div class="brand">VoiceCheck IA</div>
      <h1>${esc(title)}</h1>
    </div>
    <div class="page-num">Página ${page} de ${total}</div>
  </div>`;
}

function footer(): string {
  return `<div class="ftr">
    Devolutiva pedagógica com base em medições acústicas observáveis.
    Não é diagnóstico clínico nem fonoaudiológico. VoiceCheck IA
  </div>`;
}

export function buildStudentReportHtml(
  report: VoiceCheckF0Report,
  personal: VoiceCheckReportPersonalization = {},
): string {
  const clusters = prioritizeClusters(report.events ?? []);
  const priorities = clusters.slice(0, 3);
  const positives = report.positive_findings ?? [];
  const exercises = buildTrainingPlan(clusters, report.recommendations ?? []);
  const domains = explainMyVoice(report);
  const summary = simpleSummary(report, clusters);
  const goal = nextGoal(clusters, positives);
  const when = (personal.generatedAt ?? new Date()).toLocaleString("pt-BR");
  const student = personal.studentName?.trim() || "Aluno(a)";
  const asset = personal.assetName?.trim() || "Gravação analisada";
  const totalPages = 5;

  const p1 = `
    <section class="page">
      ${header("Minha avaliação vocal", 1, totalPages)}
      <div class="meta">
        ${omitEmpty("Aluno(a)", student)}
        ${omitEmpty("Professor(a)", personal.teacherName)}
        <div><strong>Data:</strong> ${esc(when)}</div>
        <div><strong>Gravação:</strong> ${esc(asset)}</div>
        <div><strong>Duração:</strong> ${esc(formatClock(report.duration_seconds))}</div>
        ${omitEmpty("Objetivo do treinamento", personal.trainingGoal)}
        ${omitEmpty("Nível", personal.experienceLevel)}
      </div>
      <h2>Resumo</h2>
      <div class="lead">${esc(summary)}</div>
      ${personal.teacherNotes?.trim() ? `<p class="muted"><strong>Nota do professor:</strong> ${esc(personal.teacherNotes)}</p>` : ""}

      <h3><span class="tag ok">Pontos positivos observados</span></h3>
      ${
        positives.length === 0
          ? `<p class="muted">Nenhum ponto positivo com evidência calibrada nesta gravação.</p>`
          : positives
              .map(
                (p) => `<div class="card pos">
            <h4>${esc(p.title)}</h4>
            <p>${esc(p.description)}</p>
            ${
              p.start_seconds != null && p.end_seconds != null
                ? `<div class="time">${esc(formatClock(p.start_seconds))} – ${esc(formatClock(p.end_seconds))}</div>`
                : ""
            }
          </div>`,
              )
              .join("")
      }

      <h3><span class="tag warn">Três prioridades de desenvolvimento</span></h3>
      ${
        priorities.length === 0
          ? `<p class="muted">Sem prioridades destacadas com evidência suficiente.</p>`
          : priorities
              .map(
                (c, i) => `<div class="card prio">
            <h4>${i + 1}. ${esc(c.simpleName)}</h4>
            <p>${esc(c.observed)}</p>
            <p class="muted">${c.count} trecho(s) agrupado(s) · exemplos: ${esc(
              c.samples.map((s) => formatClock(s.start_seconds)).join(", "),
            )}</p>
          </div>`,
              )
              .join("")
      }

      <div class="goal">${esc(goal)}</div>
      ${footer()}
    </section>`;

  const p2 = `
    <section class="page">
      ${header("Onde preciso melhorar", 2, totalPages)}
      <p class="muted">Ocorrências agrupadas por tipo. Cada item resume vários trechos semelhantes — sem repetir a mesma explicação dezenas de vezes. Nem todo destaque é necessariamente um “erro”: pode ser escolha artística ou limite da análise.</p>
      <div class="chart">${svgCategoryBars(
        clusters.flatMap((c) => c.samples.map((s) => ({ ...s, title: c.simpleName }))),
      )}</div>
      <p class="muted">Distribuição simplificada das categorias priorizadas.</p>
      ${
        clusters.length === 0
          ? `<p class="muted">Nenhuma ocorrência com evidência suficiente para destacar.</p>`
          : clusters
              .slice(0, 8)
              .map(
                (c) => `<div class="card">
            <span class="tag warn">${esc(c.simpleName)}</span>
            <div class="time">${esc(
              c.samples.map((s) => `${formatClock(s.start_seconds)}–${formatClock(s.end_seconds)}`).join(" · "),
            )}${c.count > c.samples.length ? ` · +${c.count - c.samples.length} trecho(s)` : ""}</div>
            <p><strong>O que foi observado:</strong> ${esc(c.observed)}</p>
            <p><strong>O que isso pode significar:</strong> ${esc(c.mayMean)}</p>
            <p><strong>Como melhorar:</strong> ${esc(c.howToImprove)}</p>
            ${c.exercise ? `<p><strong>Exercício relacionado:</strong> ${esc(c.exercise)}</p>` : ""}
          </div>`,
              )
              .join("")
      }
      ${footer()}
    </section>`;

  const p3 = `
    <section class="page">
      ${header("Entendendo minha voz", 3, totalPages)}
      <p class="muted">Só mostramos indicadores disponíveis nesta análise. Sem referência musical, não classificamos afinação absoluta como certa ou errada.</p>
      ${domains
        .map(
          (d) => `<div class="card domain">
          <h4>${esc(d.title)} ${d.available ? "" : `<span class="muted">(poucos dados nesta gravação)</span>`}</h4>
          <p>${esc(d.plain)}</p>
          ${d.detail ? `<p class="muted">${esc(d.detail)}</p>` : ""}
        </div>`,
        )
        .join("")}
      <h3>Números explicados (opcional)</h3>
      <div class="grid2">
        <div class="card">
          <h4>Altura mediana observada</h4>
          <p>${
            report.observed_range.median_hz != null
              ? `${report.observed_range.median_hz} Hz — valor central da frequência fundamental detectada, não uma “nota certa”.`
              : "Indisponível nesta gravação."
          }</p>
        </div>
        <div class="card">
          <h4>Quanto da gravação teve voz clara</h4>
          <p>${report.statistics.valid_frame_percent}% dos trechos analisados tiveram altura confiável o bastante para medir.</p>
        </div>
      </div>
      ${footer()}
    </section>`;

  const p4 = `
    <section class="page">
      ${header("Meu plano de treinamento", 4, totalPages)}
      <p class="muted">Exercícios ligados às ocorrências reais desta gravação. O professor pode ajustar ou trocar itens.</p>
      ${
        exercises.length === 0
          ? `<p class="muted">Sem exercícios gerados — não há ocorrências prioritárias com evidência.</p>`
          : exercises
              .map(
                (ex, i) => `<div class="card ex">
            <h4>${i + 1}. ${esc(ex.title)}</h4>
            <p><strong>Objetivo:</strong> ${esc(ex.objective)}</p>
            <p><strong>Trecho:</strong> ${esc(ex.excerpt)}</p>
            <p><strong>Passo a passo:</strong></p>
            <ol class="steps">${ex.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
            <p><strong>Duração sugerida:</strong> ~${ex.durationMin} min · <strong>Repetições:</strong> ${ex.repetitions}</p>
            <p><strong>Como acompanhar:</strong> ${esc(ex.tracking)}</p>
            <p class="muted"><strong>Cuidados:</strong> ${esc(ex.care)}</p>
          </div>`,
              )
              .join("")
      }
      ${personal.finalComments?.trim() ? `<div class="lead"><strong>Comentário final do professor:</strong> ${esc(personal.finalComments)}</div>` : ""}
      ${footer()}
    </section>`;

  const p5 = `
    <section class="page">
      ${header("Minha evolução", 5, totalPages)}
      <div class="lead">
        A comparação entre gravações equivalentes ainda depende de histórico salvo de análises.
        Nesta versão, o histórico local do VoiceCheck guarda o arquivo, mas ainda não uma série de relatórios comparáveis.
        <strong>Não inventamos melhorias</strong> sem duas ou mais análises equivalentes.
      </div>
      <div class="card">
        <h4>Como usar este espaço nas próximas aulas</h4>
        <p>1. Grave o mesmo trecho após o plano de treinamento.</p>
        <p>2. Rode a análise de novo no VoiceCheck.</p>
        <p>3. Compare as prioridades desta página 2 com a nova devolutiva.</p>
        <p class="muted">Quando o histórico de análises estiver disponível, esta página mostrará evolução real (ex.: menos interrupções, mais estabilidade).</p>
      </div>
      <h3>Snapshot desta sessão (para referência futura)</h3>
      <div class="grid2">
        <div class="card"><h4>Prioridades agora</h4><p>${
          priorities.length
            ? esc(priorities.map((p) => p.simpleName).join(" · "))
            : "Nenhuma destacada"
        }</p></div>
        <div class="card"><h4>Pontos positivos agora</h4><p>${
          positives.length ? esc(positives.map((p) => p.title).join(" · ")) : "Nenhum calibrado"
        }</p></div>
      </div>
      ${footer()}
    </section>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>VoiceCheck — Relatório do aluno — ${esc(student)}</title>
  <style>${studentCss()}</style>
</head>
<body>
  <div class="actions">
    <button type="button" onclick="window.print()">Salvar PDF do aluno</button>
  </div>
  ${p1}${p2}${p3}${p4}${p5}
</body>
</html>`;
}
