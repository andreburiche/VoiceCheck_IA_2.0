/**
 * VoiceCheck IA 2.0 — protocolo de voz (puro, testável): resumo das medidas mais recentes
 * de cada parte da avaliação e sugestões de valores para o DSI.
 */
import {
  fixoBR,
  type AnaliseAcustica,
  type AnaliseFala,
  type Avaliacao,
  type ResultadoDsi,
  type ResultadoFonetograma,
  type ResultadoGrbasi,
  type ResultadoIdv10,
  type ResultadoQvv,
} from "@/lib/voz-clinica-api";

/** Texto para a leitura (escrito para o VoiceCheck, frases curtas e só sons sonoros no começo). */
export const TEXTO_LEITURA =
  "Maria mora numa casa amarela, perto do mar. Toda manhã ela abre a janela, olha as ondas e liga o rádio. " +
  "Depois, toma um café com leite, lê o jornal e sai para o trabalho. No caminho, encontra os vizinhos e conversa um pouco " +
  "sobre o tempo, a feira e as novidades da semana. À noite, volta cansada, mas feliz.";

function maisRecente(itens: Avaliacao[], tipo: Avaliacao["tipo"], ok: (a: Avaliacao) => boolean = () => true): Avaliacao | undefined {
  return itens.filter((a) => a.tipo === tipo && ok(a)).sort((x, y) => y.criado_em.localeCompare(x.criado_em))[0];
}


export type Sugestao = { valor: number; origem: string };
export type SugestoesDsi = { tmf_s?: Sugestao; f0_alta_hz?: Sugestao; jitter_pct?: Sugestao };

function dia(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Mesmo dia no fuso de quem usa (às 22 h em Brasília já é outro dia em UTC). */
function mesmoDia(a: string, b: string): boolean {
  return dia(a) === dia(b);
}

/**
 * Valores do histórico para preencher o DSI (o profissional confere e pode trocar):
 * - TMF: o maior tempo de fonação entre as análises do dia mais recente (o TMF é a melhor de
 *   três tentativas da vogal sustentada o máximo possível);
 * - F0-alta: nota mais aguda do fonetograma mais recente;
 * - jitter: análise acústica mais recente.
 * A intensidade mais fraca (I-baixa) precisa de dB SPL: não há sugestão sem calibração.
 */
export function sugestoesDsi(itens: Avaliacao[]): SugestoesDsi {
  const s: SugestoesDsi = {};
  const ac = (a: Avaliacao) => a.resultado as AnaliseAcustica;
  const ultima = maisRecente(itens, "acustica", (a) => !!ac(a).f0);
  if (ultima) {
    const doDia = itens.filter((a) => a.tipo === "acustica" && ac(a).fonacao?.tmf_s != null && mesmoDia(a.criado_em, ultima.criado_em));
    const melhor = doDia.reduce<Avaliacao | null>((m, a) => (!m || (ac(a).fonacao?.tmf_s ?? 0) > (ac(m).fonacao?.tmf_s ?? 0) ? a : m), null);
    const tmf = melhor ? ac(melhor).fonacao?.tmf_s : undefined;
    if (tmf != null) {
      s.tmf_s = { valor: Math.round(tmf * 10) / 10, origem: `maior tempo de fonação em ${dia(ultima.criado_em)} (${doDia.length} ${doDia.length === 1 ? "gravação" : "gravações"})` };
    }
    const jitter = ac(ultima).perturbacao?.jitter_local_pct;
    if (jitter != null) s.jitter_pct = { valor: Math.round(jitter * 100) / 100, origem: `análise acústica de ${dia(ultima.criado_em)}` };
  }
  const campo = maisRecente(itens, "fonetograma", (a) => (a.resultado as ResultadoFonetograma).resumo?.hz_agudo != null);
  if (campo) {
    const r = (campo.resultado as ResultadoFonetograma).resumo;
    s.f0_alta_hz = { valor: Math.round(r.hz_agudo as number), origem: `fonetograma de ${dia(campo.criado_em)} (${r.nota_aguda})` };
  }
  return s;
}

/** Posição do DSI na escala de Wuyts (-5 a +5), 0–100 % para a barra. */
export function posicaoDsi(valor: number): number {
  return Math.max(0, Math.min(100, ((valor + 5) / 10) * 100));
}

export type LinhaProtocolo = { grupo: string; medida: string; valor: string; data: string | null };

/** Quadro do protocolo de voz: a medida mais recente de cada parte ("—" = ainda não avaliado). */
export function linhasProtocolo(itens: Avaliacao[]): LinhaProtocolo[] {
  const linhas: LinhaProtocolo[] = [];
  const add = (grupo: string, medida: string, a: Avaliacao | undefined, valor: (a: Avaliacao) => string) =>
    linhas.push({ grupo, medida, valor: a ? valor(a) : "—", data: a ? dia(a.criado_em) : null });

  const fala = maisRecente(itens, "fala", (a) => !!(a.resultado as AnaliseFala).f0);
  const f = (a: Avaliacao) => (a.resultado as AnaliseFala).f0!;
  add("Fala", "F0 habitual (mediana)", fala, (a) => `${fixoBR(f(a).mediana_hz, 0)} Hz (${f(a).nota_mediana})`);
  add("Fala", "Variação na fala (p5–p95)", fala, (a) => `${fixoBR(f(a).p5_hz, 0)}–${fixoBR(f(a).p95_hz, 0)} Hz · ${fixoBR(f(a).faixa_semitons, 1)} st`);

  const vogal = maisRecente(itens, "acustica", (a) => !!(a.resultado as AnaliseAcustica).f0);
  const v = (a: Avaliacao) => a.resultado as AnaliseAcustica;
  add("Vogal sustentada", "F0 média", vogal, (a) => `${fixoBR(v(a).f0?.media_hz, 1)} Hz`);
  add("Vogal sustentada", "Jitter / shimmer", vogal, (a) => `${fixoBR(v(a).perturbacao?.jitter_local_pct, 2)} % / ${fixoBR(v(a).perturbacao?.shimmer_local_pct, 2)} %`);
  add("Vogal sustentada", "HNR / CPPS", vogal, (a) => `${fixoBR(v(a).ruido?.hnr_db, 1)} dB / ${fixoBR(v(a).cpps_db, 1)} dB`);
  add("Vogal sustentada", "GNE / MWC", vogal, (a) => `${fixoBR(v(a).excitacao?.gne, 2)} / ${fixoBR(v(a).excitacao?.mwc, 2)}`);
  add("Vogal sustentada", "Tempo de fonação", vogal, (a) => `${fixoBR(v(a).fonacao?.tmf_s, 1)} s`);

  const campo = maisRecente(itens, "fonetograma", (a) => !!(a.resultado as ResultadoFonetograma).resumo?.nota_grave);
  const c = (a: Avaliacao) => (a.resultado as ResultadoFonetograma).resumo;
  add("Extensão (fonetograma)", "Notas e extensão", campo, (a) => `${c(a).nota_grave}–${c(a).nota_aguda} · ${c(a).extensao_st} st`);

  add("Índice", "DSI", maisRecente(itens, "dsi"), (a) => fixoBR((a.resultado as ResultadoDsi).dsi, 2));

  add("Autoavaliação", "IDV-10", maisRecente(itens, "idv10"), (a) => `${(a.resultado as ResultadoIdv10).total} de 40`);
  add("Autoavaliação", "QVV total", maisRecente(itens, "qvv"), (a) => fixoBR((a.resultado as ResultadoQvv).total, 1));
  add("Perceptivo", "GRBASI", maisRecente(itens, "grbasi"), (a) => (a.resultado as ResultadoGrbasi).registro);
  return linhas;
}
