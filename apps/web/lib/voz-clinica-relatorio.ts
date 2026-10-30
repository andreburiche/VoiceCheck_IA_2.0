/**
 * VoiceCheck IA 2.0 — relatório da avaliação clínica (HTML A4 → "Salvar como PDF").
 * Mesmo padrão dos relatórios do VoiceCheck: HTML montado aqui e impresso por
 * iframe (printHtmlDocument). Só usa dados já medidos; nada é recalculado.
 */
import {
  ROTULO_TIPO,
  fixoBR,
  linhasAcusticas,
  numeroBR,
  resumoAvaliacao,
  resumoProtocolo,
  type AnaliseAcustica,
  type Avaliacao,
  type ResultadoEaseBr,
  type ResultadoGrbasi,
  type ResultadoPerceptiva,
  type ResultadoIdv10,
  type ResultadoQvv,
} from "@/lib/voz-clinica-api";
import { linhasAnamnese, type Anamnese } from "@/lib/voz-clinica-anamnese";
import { dataCurta, escalaY, seriesEvolucao, variacaoTexto, type SerieEvolucao } from "@/lib/voz-clinica-evolucao";
import { BRAND, esc, omitEmpty, printHtmlDocument } from "@/lib/voicecheck-report-shared";

export type OpcoesRelatorio = {
  profissional?: string | null;
  observacoes?: string | null;
  geradoEm?: Date;
  /** Idade, sexo e profissão do cadastro (contatos não entram no relatório). */
  dadosPaciente?: string | null;
};

function dataHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function dataDia(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

const fixo = fixoBR;

/** Mais recente de um tipo (lista pode vir em qualquer ordem). */
function ultimaDoTipo(itens: Avaliacao[], tipo: Avaliacao["tipo"]): Avaliacao | undefined {
  return itens.filter((a) => a.tipo === tipo).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
}

// ---------------------------------------------------------------------------
// Gráfico de evolução em SVG estático (impressão: fundo branco, sem interação)
// ---------------------------------------------------------------------------

export function svgEvolucao(serie: SerieEvolucao): string {
  const W = 330;
  const H = 130;
  const PE = 34;
  const PD = 10;
  const PT = 10;
  const PB = 20;
  const { min, max, marcas } = escalaY(serie);
  const n = serie.pontos.length;
  const x = (i: number) => (n > 1 ? PE + (i / (n - 1)) * (W - PE - PD) : PE + (W - PE - PD) / 2);
  const y = (v: number) => PT + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * (H - PT - PB);
  const r = (v: number) => Math.round(v * 10) / 10;
  const passo = Math.max(1, Math.ceil(n / 5));

  const grade = marcas
    .map(
      (m) => `<line x1="${PE}" x2="${W - PD}" y1="${r(y(m))}" y2="${r(y(m))}" stroke="${BRAND.line}" stroke-width="0.8"/>` +
        `<text x="${PE - 5}" y="${r(y(m)) + 3}" text-anchor="end" font-size="8" fill="${BRAND.muted}">${esc(numeroBR(m, 2))}</text>`,
    )
    .join("");
  const corte = serie.corte
    ? `<line x1="${PE}" x2="${W - PD}" y1="${r(y(serie.corte.valor))}" y2="${r(y(serie.corte.valor))}" stroke="${BRAND.muted}" stroke-width="0.8" stroke-dasharray="3 3"/>` +
      `<text x="${PE + 3}" y="${r(y(serie.corte.valor)) + (y(serie.corte.valor) - PT < 12 ? 10 : -3)}" font-size="8" fill="${BRAND.muted}">${esc(serie.corte.rotulo)}</text>`
    : "";
  const linha = serie.pontos.map((p, i) => `${r(x(i))},${r(y(p.valor))}`).join(" ");
  const pontos = serie.pontos
    .map((p, i) => `<circle cx="${r(x(i))}" cy="${r(y(p.valor))}" r="2.6" fill="${BRAND.teal}"/>`)
    .join("");
  const datas = serie.pontos
    .map((p, i) =>
      i % passo === 0 || i === n - 1
        ? `<text x="${r(x(i))}" y="${H - 5}" text-anchor="${n > 1 && i === n - 1 ? "end" : n > 1 && i === 0 ? "start" : "middle"}" font-size="8" fill="${BRAND.muted}">${esc(dataCurta(p.data))}</text>`
        : "",
    )
    .join("");
  const descricao = `${serie.titulo}: ${serie.pontos.map((p) => `${dataCurta(p.data)} ${fixo(p.valor, serie.casas)}`).join(", ")}`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(descricao)}" font-family="Segoe UI, Arial, sans-serif">${grade}${corte}<polyline points="${linha}" fill="none" stroke="${BRAND.teal}" stroke-width="1.6" stroke-linejoin="round"/>${pontos}${datas}</svg>`;
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

function secaoAcustica(itens: Avaliacao[]): string {
  const a = ultimaDoTipo(itens, "acustica");
  if (!a) return "";
  const r = a.resultado as AnaliseAcustica;
  const linhas = linhasAcusticas(r);
  if (!linhas.length) return "";
  const p = r.perturbacao ?? {};
  const tem = (...v: (number | null | undefined)[]) => v.every((x) => typeof x === "number" && Number.isFinite(x));
  // medidas complementares só entram quando o motor as calculou (sem linhas de "—")
  const extras: [string, string][] = [
    ...(tem(p.jitter_rap_pct, p.jitter_ppq5_pct)
      ? [["Jitter RAP / PPQ5", `${fixo(p.jitter_rap_pct, 2)} / ${fixo(p.jitter_ppq5_pct, 2)} %`] as [string, string]] : []),
    ...(tem(p.shimmer_apq3_pct, p.shimmer_apq5_pct)
      ? [["Shimmer APQ3 / APQ5", `${fixo(p.shimmer_apq3_pct, 2)} / ${fixo(p.shimmer_apq5_pct, 2)} %`] as [string, string]] : []),
    ...(tem(p.shimmer_local_db) ? [["Shimmer local (dB)", `${fixo(p.shimmer_local_db, 3)} dB`] as [string, string]] : []),
    ...(tem(p.ciclos) ? [["Ciclos analisados", fixo(p.ciclos, 0)] as [string, string]] : []),
  ];
  const corpo = [...linhas, ...extras]
    .map(([m, v]) => `<tr><td>${esc(m)}</td><td class="num">${esc(v)}</td></tr>`)
    .join("");
  const motor = r.motor === "praat" ? `Praat ${r.versao_praat ?? ""}`.trim() : "motor interno";
  const avisos = (r.avisos ?? []).map((t) => `<li>${esc(t)}</li>`).join("");
  return `<section>
    <h2>Análise acústica — ${esc(dataHora(a.criado_em))}</h2>
    <table class="medidas"><thead><tr><th>Medida</th><th class="num">Valor</th></tr></thead><tbody>${corpo}</tbody></table>
    <p class="muted">Vogal sustentada · ${esc(fixo(r.duracao_s, 1))} s gravados · calculado por ${esc(motor)}.</p>
    ${avisos ? `<ul class="avisos">${avisos}</ul>` : ""}
  </section>`;
}

/** Anamnese mais recente, só com os campos preenchidos. */
function secaoAnamnese(itens: Avaliacao[]): string {
  const a = ultimaDoTipo(itens, "anamnese");
  if (!a) return "";
  const linhas = linhasAnamnese(a.resultado as Anamnese);
  if (!linhas.length) return "";
  const corpo = linhas.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
  return `<section><h2>Anamnese — ${esc(dataDia(a.criado_em))}</h2>
    <table class="anamnese"><tbody>${corpo}</tbody></table></section>`;
}

function secaoProtocolos(itens: Avaliacao[]): string {
  const blocos: string[] = [];
  const idv = ultimaDoTipo(itens, "idv10");
  if (idv) {
    const r = idv.resultado as ResultadoIdv10;
    blocos.push(`<div class="card"><div class="lbl">IDV-10 · ${esc(dataDia(idv.criado_em))}</div>
      <div class="val">${esc(fixo(r.total, 0))} <span class="unid">de ${r.maximo}</span></div>
      <div class="muted">${r.acima_do_corte ? "Acima" : "Dentro"} da nota de corte (${esc(fixo(r.corte, 1))}).</div></div>`);
  }
  const qvv = ultimaDoTipo(itens, "qvv");
  if (qvv) {
    const r = qvv.resultado as ResultadoQvv;
    const problemas = r.itens_com_problema?.length ? ` Itens marcados como problema: ${r.itens_com_problema.join(", ")}.` : "";
    blocos.push(`<div class="card"><div class="lbl">QVV · ${esc(dataDia(qvv.criado_em))}</div>
      <div class="val">${esc(fixo(r.total, 1))} <span class="unid">de 100</span></div>
      <div class="muted">Físico ${esc(fixo(r.fisico, 1))} · socioemocional ${esc(fixo(r.socioemocional, 1))}. ${r.abaixo_do_corte ? "Abaixo" : "Acima"} da nota de corte (${esc(fixo(r.corte_total, 2))}).${esc(problemas)}</div></div>`);
  }
  const g = ultimaDoTipo(itens, "grbasi");
  if (g) {
    const r = g.resultado as ResultadoGrbasi;
    const params = Object.entries(r.parametros ?? {})
      .map(([letra, p]) => `${letra} ${p.nota}${p.nivel ? ` (${p.nivel})` : ""}`)
      .join(" · ");
    blocos.push(`<div class="card"><div class="lbl">GRBASI · ${esc(dataDia(g.criado_em))}</div>
      <div class="val">${esc(r.registro)}</div>
      <div class="muted">${esc(params)}</div></div>`);
  }
  const perc = ultimaDoTipo(itens, "perceptiva");
  if (perc) {
    const r = perc.resultado as ResultadoPerceptiva;
    blocos.push(`<div class="card"><div class="lbl">Perceptiva complementar · ${esc(dataDia(perc.criado_em))}</div>
      <div class="muted">${esc(resumoProtocolo(r))}${r.observacoes ? `. ${esc(r.observacoes)}` : ""}</div></div>`);
  }
  const ease = ultimaDoTipo(itens, "easebr");
  if (ease) {
    const r = ease.resultado as ResultadoEaseBr;
    const queixa = r.itens_com_queixa?.length ? ` Itens com 2 ou 3 pontos: ${r.itens_com_queixa.join(", ")}.` : "";
    blocos.push(`<div class="card"><div class="lbl">EASE-BR · ${esc(dataDia(ease.criado_em))}</div>
      <div class="val">${esc(fixo(r.total, 0))} <span class="unid">de ${r.maximo}</span></div>
      <div class="muted">Facilidade para cantar; quanto maior, mais queixa. Sem nota de corte publicada.${esc(queixa)}</div></div>`);
  }
  if (!blocos.length) return "";
  return `<section><h2>Protocolos e avaliação perceptiva</h2><div class="cards">${blocos.join("")}</div></section>`;
}

function secaoEvolucao(itens: Avaliacao[]): string {
  const series = seriesEvolucao(itens);
  if (!series.length) return "";
  const graficos = series
    .map(
      (s) => `<figure class="grafico"><figcaption><strong>${esc(s.titulo)}</strong>
        <span>${esc(variacaoTexto(s))}</span></figcaption>${svgEvolucao(s)}</figure>`,
    )
    .join("");
  return `<section><h2>Evolução</h2>
    <p class="muted">Uma medida por gráfico, da sessão mais antiga para a mais recente (até 12 sessões). Os valores estão na tabela de sessões.</p>
    <div class="graficos">${graficos}</div></section>`;
}

/** Tabela com todas as sessões (o que os gráficos mostram, em números). */
function secaoSessoes(itens: Avaliacao[]): string {
  const ordenadas = [...itens].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const linhas = ordenadas
    .map((a) => {
      let resumo: string;
      if (a.tipo === "acustica") {
        const r = a.resultado as AnaliseAcustica;
        const p = r.perturbacao ?? {};
        resumo = `F0 ${fixo(r.f0?.media_hz, 1)} Hz · jitter ${fixo(p.jitter_local_pct, 2)} % · shimmer ${fixo(p.shimmer_local_pct, 2)} % · HNR ${fixo(r.ruido?.hnr_db, 1)} dB · CPPS ${fixo(r.cpps_db, 1)} dB`;
      } else {
        resumo = resumoAvaliacao(a);
      }
      return `<tr><td class="nowrap">${esc(dataHora(a.criado_em))}</td><td>${esc(ROTULO_TIPO[a.tipo])}</td><td>${esc(resumo)}</td></tr>`;
    })
    .join("");
  return `<section class="quebra-ok"><h2>Sessões registradas</h2>
    <table><thead><tr><th>Data</th><th>Avaliação</th><th>Resultado</th></tr></thead><tbody>${linhas}</tbody></table></section>`;
}

function css(): string {
  return `
    @page { size: A4; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: ${BRAND.ink}; background: #fff;
           font-size: 9.5pt; line-height: 1.4; margin: 0; }
    h1 { font-size: 16pt; margin: 0 0 2pt; }
    h2 { font-size: 11pt; color: ${BRAND.tealDark}; margin: 14pt 0 6pt; border-bottom: 1.5pt solid ${BRAND.teal};
         padding-bottom: 3pt; page-break-after: avoid; }
    .sub { color: ${BRAND.muted}; margin: 0 0 8pt; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2pt 12pt; background: ${BRAND.paper};
            border: 1pt solid ${BRAND.line}; border-radius: 6pt; padding: 8pt 10pt; font-size: 8.5pt; color: ${BRAND.muted}; }
    .meta strong { color: ${BRAND.ink}; }
    table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 4pt 0 6pt; }
    th, td { border-bottom: 1pt solid ${BRAND.line}; padding: 3pt 5pt; text-align: left; vertical-align: top; }
    th { color: ${BRAND.muted}; font-size: 7.5pt; text-transform: uppercase; font-weight: 600; }
    tr { page-break-inside: avoid; }
    .num { text-align: right; font-family: ui-monospace, Consolas, monospace; white-space: nowrap; }
    .nowrap { white-space: nowrap; }
    table.medidas { width: 70%; }
    table.anamnese th { width: 32%; text-transform: none; font-size: 8pt; text-align: left; vertical-align: top; }
    table.anamnese td { white-space: pre-wrap; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6pt; }
    .card { border: 1pt solid ${BRAND.line}; border-radius: 5pt; padding: 6pt 8pt; page-break-inside: avoid; }
    .card .lbl { font-size: 7.5pt; text-transform: uppercase; color: ${BRAND.muted}; }
    .card .val { font-family: ui-monospace, Consolas, monospace; font-size: 13pt; margin: 2pt 0; }
    .card .unid { font-size: 8pt; color: ${BRAND.muted}; }
    .graficos { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt 12pt; }
    .grafico { margin: 0; page-break-inside: avoid; }
    .grafico figcaption { display: flex; justify-content: space-between; gap: 6pt; font-size: 8.5pt; margin-bottom: 2pt; }
    .grafico figcaption span { color: ${BRAND.muted}; font-family: ui-monospace, Consolas, monospace; font-size: 8pt; }
    .muted { color: ${BRAND.muted}; font-size: 8pt; }
    .avisos { margin: 2pt 0 0 14pt; padding: 0; color: ${BRAND.caution}; font-size: 8pt; }
    .obs { white-space: pre-wrap; border: 1pt solid ${BRAND.line}; border-radius: 5pt; padding: 6pt 8pt; }
    .ftr { margin-top: 14pt; padding-top: 6pt; border-top: 1pt solid ${BRAND.line}; font-size: 7.5pt; color: ${BRAND.muted}; }
    .ftr p { margin: 0 0 3pt; }
    .actions { margin-bottom: 8pt; }
    .actions button { background: ${BRAND.teal}; color: #fff; border: none; border-radius: 6pt; padding: 7pt 12pt;
                      font-size: 10pt; cursor: pointer; }
    @media print { .actions { display: none; } }
  `;
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

export function montarRelatorioClinico(paciente: string, itens: Avaliacao[], opcoes: OpcoesRelatorio = {}): string {
  const nome = paciente.trim() || "Paciente";
  if (!itens.length) throw new Error("Não há avaliações salvas para este paciente.");
  const ordenadas = [...itens].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const primeira = ordenadas[0]!;
  const ultima = ordenadas[ordenadas.length - 1]!;
  const geradoEm = (opcoes.geradoEm ?? new Date()).toLocaleString("pt-BR");
  const periodo =
    dataDia(primeira.criado_em) === dataDia(ultima.criado_em)
      ? dataDia(ultima.criado_em)
      : `${dataDia(primeira.criado_em)} a ${dataDia(ultima.criado_em)}`;
  const obs = opcoes.observacoes?.trim();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>VoiceCheck — Avaliação vocal — ${esc(nome)}</title>
  <style>${css()}</style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Salvar PDF</button></div>
  <h1>Relatório de avaliação vocal</h1>
  <p class="sub">VoiceCheck IA · avaliação clínica da voz</p>
  <div class="meta">
    <div><strong>Paciente:</strong> ${esc(nome)}</div>
    ${omitEmpty("Dados", opcoes.dadosPaciente)}
    ${omitEmpty("Profissional", opcoes.profissional)}
    <div><strong>Período:</strong> ${esc(periodo)}</div>
    <div><strong>Avaliações:</strong> ${ordenadas.length}</div>
    <div><strong>Gerado em:</strong> ${esc(geradoEm)}</div>
  </div>
  ${secaoAnamnese(itens)}
  ${secaoAcustica(itens)}
  ${secaoProtocolos(itens)}
  ${secaoEvolucao(itens)}
  ${secaoSessoes(itens)}
  ${obs ? `<section><h2>Observações do profissional</h2><div class="obs">${esc(obs)}</div></section>` : ""}
  <div class="ftr">
    <p>Medidas acústicas calculadas a partir das gravações enviadas. A intensidade é relativa (dBFS): valores absolutos em dB SPL exigem microfone calibrado.</p>
    <p>Notas de corte: IDV-10 7,5 e QVV 91,25 (Behlau et al., 2016). EASE-BR: 22 itens de 0 a 3, itens 6, 12 e 21 invertidos, total de 0 a 66 (Rocha et al., 2014), sem nota de corte publicada. Os textos dos itens dos protocolos seguem as versões validadas no Brasil.</p>
    <p>Este relatório apoia a avaliação do profissional e não é um diagnóstico médico.</p>
  </div>
</body>
</html>`;
}

/** Abre o diálogo de impressão do navegador ("Salvar como PDF"). */
export function imprimirRelatorioClinico(paciente: string, itens: Avaliacao[], opcoes: OpcoesRelatorio = {}): void {
  printHtmlDocument(montarRelatorioClinico(paciente, itens, opcoes));
}
