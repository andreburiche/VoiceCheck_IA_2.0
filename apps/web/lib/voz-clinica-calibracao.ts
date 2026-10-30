/**
 * VoiceCheck IA 2.0 — calibração de intensidade (dBFS → dB SPL).
 *
 * O navegador só mede intensidade relativa à escala do conversor (dBFS). Com um
 * decibelímetro ao lado do microfone, o profissional sustenta uma vogal estável,
 * lê o nível no aparelho e a tela mede o dBFS ao mesmo tempo: a diferença
 * (deslocamento) converte as leituras seguintes em dB SPL, como no lingWAVES.
 *
 * Vale só para o mesmo microfone, o mesmo ganho da interface e a mesma distância;
 * fica guardada neste navegador (é do equipamento, não do paciente).
 */

import { SILENCIO_DBFS } from "@/lib/voz-clinica-biofeedback";

export type Ponderacao = "A" | "C" | "Z";

/**
 * A intensidade só é registrada quando há voz detectada (acima de SILENCIO_DBFS). Uma "voz mais
 * fraca" a menos de 2 dB desse piso pode ser, na verdade, ainda mais fraca: não serve de medida.
 */
export function noPisoDeDeteccao(dbfs: number | null | undefined): boolean {
  return typeof dbfs === "number" && dbfs <= SILENCIO_DBFS + 2;
}

export type Calibracao = {
  /** dB SPL = dBFS + deslocamento. */
  deslocamento_db: number;
  /** Nível lido no decibelímetro durante a medição. */
  referencia_db_spl: number;
  ponderacao: Ponderacao;
  distancia_cm: number;
  /** Nome do microfone informado pelo navegador (para avisar se trocar). */
  microfone: string;
  /** ISO 8601. */
  data: string;
};

export const CHAVE_CALIBRACAO = "vc2-calibracao-spl";
/** Avisado quando a calibração muda nesta página (as abas que mostram intensidade releem). */
export const EVENTO_CALIBRACAO = "vc2-calibracao";

function avisarMudanca(): void {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_CALIBRACAO));
  } catch {
    /* sem window (testes): nada a avisar */
  }
}
/** Mínimo de som estável para a medição valer. */
export const MEDICAO_MINIMA_S = 2;
/** Diferença máxima entre as leituras mais fracas e as mais fortes (10º e 90º percentis). */
export const VARIACAO_MAXIMA_DB = 6;
/** Calibração mais velha que isso merece ser refeita. */
export const VALIDADE_DIAS = 30;

export type ResultadoMedicao =
  | { ok: true; dbfs: number; variacao_db: number; duracao_s: number }
  | { ok: false; erro: string };

function percentil(ordenados: number[], p: number): number {
  const i = (ordenados.length - 1) * p;
  const a = Math.floor(i);
  const b = Math.ceil(i);
  return ordenados[a]! + (ordenados[b]! - ordenados[a]!) * (i - a);
}

/**
 * Resume as leituras de dBFS (uma por quadro, `dt` segundos cada) de uma vogal
 * sustentada. Descarta silêncio (abaixo de -60 dBFS), o primeiro meio segundo
 * (ataque) e exige estabilidade: sem ela o número do decibelímetro não
 * corresponde ao que a tela mediu.
 */
export function medirReferencia(leituras: number[], dt: number, picos: number[] = []): ResultadoMedicao {
  const inicio = Math.ceil(0.5 / dt);
  // saturação vista no PICO da forma de onda (o RMS de uma vogal ceifada fica bem abaixo de 0 dBFS)
  if (picos.slice(inicio).some((p) => p >= 0.99)) {
    return { ok: false, erro: "O sinal saturou (chegou ao máximo da escala). Baixe o ganho da interface ou afaste-se e repita." };
  }
  const sons = leituras.slice(inicio).filter((v) => Number.isFinite(v) && v > -60);
  const duracao = sons.length * dt;
  if (duracao < MEDICAO_MINIMA_S) {
    return { ok: false, erro: `Pouco som: sustente a vogal por pelo menos ${MEDICAO_MINIMA_S + 1} s, perto do microfone.` };
  }
  const ord = [...sons].sort((a, b) => a - b);
  if (ord[ord.length - 1]! > -1) {
    return { ok: false, erro: "O sinal saturou (chegou ao máximo da escala). Baixe o ganho da interface ou afaste-se e repita." };
  }
  const variacao = percentil(ord, 0.9) - percentil(ord, 0.1);
  if (variacao > VARIACAO_MAXIMA_DB) {
    return { ok: false, erro: `Voz instável (variou ${variacao.toFixed(1).replace(".", ",")} dB). Sustente a vogal com intensidade constante e repita.` };
  }
  // média em energia (como o decibelímetro), não em dB
  const energia = sons.reduce((s, v) => s + 10 ** (v / 10), 0) / sons.length;
  return { ok: true, dbfs: Math.round(10 * Math.log10(energia) * 10) / 10, variacao_db: Math.round(variacao * 10) / 10, duracao_s: Math.round(duracao * 10) / 10 };
}

export function erroDaCalibracao(c: Partial<Calibracao>): string | null {
  if (!(typeof c.referencia_db_spl === "number" && c.referencia_db_spl >= 40 && c.referencia_db_spl <= 130)) {
    return "Leitura do decibelímetro entre 40 e 130 dB SPL.";
  }
  if (!(typeof c.deslocamento_db === "number" && c.deslocamento_db >= 40 && c.deslocamento_db <= 160)) {
    return "A diferença entre o decibelímetro e o microfone ficou fora do esperado (40 a 160 dB). Confira o ganho e repita.";
  }
  if (!(c.ponderacao === "A" || c.ponderacao === "C" || c.ponderacao === "Z")) return "Escolha a ponderação do decibelímetro.";
  if (!(typeof c.distancia_cm === "number" && c.distancia_cm >= 5 && c.distancia_cm <= 100)) return "Distância entre 5 e 100 cm.";
  if (typeof c.microfone !== "string" || c.microfone.length > 120) return "Nome do microfone inválido.";
  if (typeof c.data !== "string" || Number.isNaN(Date.parse(c.data))) return "Data inválida.";
  return null;
}

export function criarCalibracao(dbfsMedido: number, referencia_db_spl: number, ponderacao: Ponderacao, distancia_cm: number,
                                microfone: string, agora = new Date()): Calibracao {
  return {
    deslocamento_db: Math.round((referencia_db_spl - dbfsMedido) * 10) / 10,
    referencia_db_spl, ponderacao, distancia_cm,
    microfone: microfone.slice(0, 120),
    data: agora.toISOString(),
  };
}

/** Calibração guardada neste navegador; null se não houver, estiver corrompida ou o armazenamento estiver bloqueado. */
export function carregarCalibracao(armazenamento: Pick<Storage, "getItem"> | null = guardaLocal()): Calibracao | null {
  try {
    const bruto = armazenamento?.getItem(CHAVE_CALIBRACAO);
    if (!bruto) return null;
    const c = JSON.parse(bruto) as Partial<Calibracao>;
    return erroDaCalibracao(c) ? null : (c as Calibracao);
  } catch {
    return null;
  }
}

export function guardarCalibracao(c: Calibracao, armazenamento: Pick<Storage, "setItem"> | null = guardaLocal()): boolean {
  try {
    armazenamento?.setItem(CHAVE_CALIBRACAO, JSON.stringify(c));
    avisarMudanca();
    return Boolean(armazenamento);
  } catch {
    return false;
  }
}

export function apagarCalibracao(armazenamento: Pick<Storage, "removeItem"> | null = guardaLocal()): void {
  try {
    armazenamento?.removeItem(CHAVE_CALIBRACAO);
    avisarMudanca();
  } catch {
    /* armazenamento bloqueado: nada a apagar */
  }
}

function guardaLocal(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function paraSpl(dbfs: number, c: Pick<Calibracao, "deslocamento_db">): number {
  return Math.round((dbfs + c.deslocamento_db) * 10) / 10;
}

/**
 * Nota de rodapé dos relatórios sobre a intensidade: relativa (dBFS), a não ser nos registros
 * feitos com o microfone calibrado — e, nesse caso, com que calibração.
 */
export function notaIntensidade(resultados: unknown[]): string {
  const cals = resultados
    .map((r) => (r && typeof r === "object" ? (r as { calibracao?: Partial<Calibracao> }).calibracao : undefined))
    .filter((c): c is Calibracao => !!c && erroDaCalibracao(c) === null);
  if (!cals.length) return "Medidas acústicas calculadas a partir das gravações enviadas. A intensidade é relativa (dBFS): valores absolutos em dB SPL exigem microfone calibrado.";
  const unicas = [...new Map(cals.map((c) => [`${c.data}|${c.deslocamento_db}`, c])).values()]
    .sort((a, b) => a.data.localeCompare(b.data));
  const desc = unicas.map((c) => `${new Date(c.data).toLocaleDateString("pt-BR")} (${c.distancia_cm.toLocaleString("pt-BR")} cm, ponderação ${c.ponderacao}, referência ${c.referencia_db_spl.toLocaleString("pt-BR")} dB SPL)`);
  return `Medidas acústicas calculadas a partir das gravações enviadas. A intensidade é relativa (dBFS), exceto onde aparece em dB SPL: nesses registros o microfone foi calibrado com decibelímetro em ${desc.join("; ")}. A conversão vale para o mesmo microfone, ganho e distância da calibração.`;
}

/** Avisos que não impedem o uso, mas o profissional precisa ver. */
export function avisosDaCalibracao(c: Calibracao, microfoneAtual: string | null, agora = new Date()): string[] {
  const avisos: string[] = [];
  const dias = (agora.getTime() - Date.parse(c.data)) / 86_400_000;
  if (dias > VALIDADE_DIAS) avisos.push(`Calibração feita há ${Math.floor(dias)} dias: refaça para manter os dB SPL confiáveis.`);
  if (microfoneAtual && c.microfone && microfoneAtual !== c.microfone) {
    avisos.push(`O microfone mudou (calibrado com "${c.microfone}", agora "${microfoneAtual}"): refaça a calibração.`);
  }
  if (c.ponderacao === "A") avisos.push("Calibrada com ponderação A: em vozes graves o valor fica alguns dB abaixo do linear (C ou Z).");
  return avisos;
}
