/**
 * VoiceCheck IA 2.0 — biofeedback ao vivo (cálculo puro, testável).
 *
 * Pitch por YIN (de Cheveigné & Kawahara, 2002) em janelas curtas do microfone,
 * nível em dBFS e o acompanhamento da sessão em relação às faixas-alvo
 * definidas pelo terapeuta.
 */
import { hzToMidi, midiToNoteName } from "@/lib/pitch-math";

export type Faixa = { min: number; max: number };
export type Posicao = "abaixo" | "dentro" | "acima";

/** Nível abaixo do qual a janela é tratada como silêncio (sem pitch). */
export const SILENCIO_DBFS = -55;
/** Limiar do YIN: menor = mais exigente para aceitar um período. */
const LIMIAR_YIN = 0.15;

/** Nível RMS da janela em dBFS (0 dBFS = escala cheia). */
export function nivelDbfs(janela: Float32Array): number {
  let soma = 0;
  for (let i = 0; i < janela.length; i++) {
    const v = janela[i] ?? 0;
    soma += v * v;
  }
  const rms = Math.sqrt(soma / Math.max(1, janela.length));
  return rms > 0 ? Math.max(-120, 20 * Math.log10(rms)) : -120;
}

/**
 * F0 da janela por YIN. Devolve null em silêncio, ruído ou fora da faixa.
 * `clareza` = 1 − d'(τ) no período escolhido (1 = periódico perfeito).
 */
export function pitchYin(
  janela: Float32Array,
  taxa: number,
  f0Min = 60,
  f0Max = 1000,
): { hz: number; clareza: number } | null {
  if (nivelDbfs(janela) < SILENCIO_DBFS) return null;
  const tauMin = Math.max(2, Math.floor(taxa / f0Max));
  const tauMax = Math.min(Math.floor(janela.length / 2), Math.ceil(taxa / f0Min));
  if (tauMax <= tauMin + 2) return null;
  const n = janela.length - tauMax;

  // diferença e diferença normalizada cumulativa (d')
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const dif = (janela[i] ?? 0) - (janela[i + tau] ?? 0);
      s += dif * dif;
    }
    d[tau] = s;
  }
  const dn = new Float32Array(tauMax + 1);
  dn[0] = 1;
  let acumulado = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    acumulado += d[tau] ?? 0;
    dn[tau] = acumulado > 0 ? ((d[tau] ?? 0) * tau) / acumulado : 1;
  }

  // primeiro mínimo abaixo do limiar; se não houver, o mínimo global
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if ((dn[t] ?? 1) < LIMIAR_YIN) {
      while (t + 1 <= tauMax && (dn[t + 1] ?? 1) < (dn[t] ?? 1)) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let melhor = Infinity;
    for (let t = tauMin; t <= tauMax; t++) {
      if ((dn[t] ?? 1) < melhor) {
        melhor = dn[t] ?? 1;
        tau = t;
      }
    }
    if (melhor > 0.35) return null; // sem periodicidade suficiente
  }

  // voz acima do teto: o período real (tau/2, tau/3) fica abaixo de tauMin e o
  // YIN acharia um submúltiplo (oitava abaixo). Nesse caso não há leitura válida.
  for (const k of [2, 3]) {
    const t = Math.round(tau / k);
    if (t >= 2 && t < tauMin) {
      const vale = Math.min(dn[t - 1] ?? 1, dn[t] ?? 1, dn[t + 1] ?? 1);
      if (vale < LIMIAR_YIN) return null;
    }
  }

  // interpolação parabólica para precisão abaixo de uma amostra
  let tauFino = tau;
  if (tau > 1 && tau < tauMax) {
    const a = dn[tau - 1] ?? 0;
    const b = dn[tau] ?? 0;
    const c = dn[tau + 1] ?? 0;
    const den = a - 2 * b + c;
    if (den !== 0) tauFino = tau + (0.5 * (a - c)) / den;
  }
  const hz = taxa / tauFino;
  if (hz < f0Min || hz > f0Max) return null;
  return { hz, clareza: Math.max(0, Math.min(1, 1 - (dn[tau] ?? 1))) };
}

export function posicaoNaFaixa(valor: number, faixa: Faixa): Posicao {
  if (valor < faixa.min) return "abaixo";
  if (valor > faixa.max) return "acima";
  return "dentro";
}

/** "A3 · 220 Hz" */
export function rotuloNota(hz: number): string {
  return `${midiToNoteName(hzToMidi(hz))} · ${Math.round(hz)} Hz`;
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export type AmostraSessao = { t: number; hz: number | null; db: number };

export type ResumoBiofeedback = {
  duracao_s: number;
  /** Tempo com voz detectada (pitch válido). */
  fonacao_s: number;
  alvo_pitch_hz: Faixa;
  alvo_volume_dbfs: Faixa;
  /** % do tempo COM VOZ dentro de cada faixa. */
  dentro_pitch_pct: number | null;
  dentro_volume_pct: number | null;
  /** Percentis 10, 50 e 90 do pitch (robustos a erros isolados). */
  f0_p10_hz: number | null;
  f0_mediana_hz: number | null;
  f0_p90_hz: number | null;
  db_mediano: number | null;
};

function percentil(ordenados: number[], p: number): number | null {
  if (!ordenados.length) return null;
  const pos = (ordenados.length - 1) * p;
  const i = Math.floor(pos);
  const f = pos - i;
  const a = ordenados[i]!;
  const b = ordenados[Math.min(i + 1, ordenados.length - 1)]!;
  return a + (b - a) * f;
}

const arred = (v: number | null, casas: number) => (v === null ? null : Math.round(v * 10 ** casas) / 10 ** casas);

/**
 * Resume a sessão. Cada amostra vale o tempo até a próxima (as leituras do
 * navegador não chegam em intervalos exatos).
 */
export function resumirSessao(amostras: AmostraSessao[], alvoPitch: Faixa, alvoVolume: Faixa): ResumoBiofeedback {
  let fonacao = 0;
  let dentroP = 0;
  let dentroV = 0;
  const hzs: number[] = [];
  const dbs: number[] = [];
  for (let i = 0; i < amostras.length; i++) {
    const a = amostras[i]!;
    const prox = amostras[i + 1];
    const dt = prox ? Math.max(0, Math.min(0.25, prox.t - a.t)) : 0;
    if (a.hz === null) continue;
    hzs.push(a.hz);
    dbs.push(a.db);
    fonacao += dt;
    if (posicaoNaFaixa(a.hz, alvoPitch) === "dentro") dentroP += dt;
    if (posicaoNaFaixa(a.db, alvoVolume) === "dentro") dentroV += dt;
  }
  hzs.sort((a, b) => a - b);
  dbs.sort((a, b) => a - b);
  const primeira = amostras[0];
  const ultima = amostras[amostras.length - 1];
  return {
    duracao_s: arred(primeira && ultima ? ultima.t - primeira.t : 0, 1) ?? 0,
    fonacao_s: arred(fonacao, 1) ?? 0,
    alvo_pitch_hz: alvoPitch,
    alvo_volume_dbfs: alvoVolume,
    dentro_pitch_pct: fonacao > 0 ? arred((100 * dentroP) / fonacao, 1) : null,
    dentro_volume_pct: fonacao > 0 ? arred((100 * dentroV) / fonacao, 1) : null,
    f0_p10_hz: arred(percentil(hzs, 0.1), 1),
    f0_mediana_hz: arred(percentil(hzs, 0.5), 1),
    f0_p90_hz: arred(percentil(hzs, 0.9), 1),
    db_mediano: arred(percentil(dbs, 0.5), 1),
  };
}

/**
 * Mediana das 3 últimas leituras de pitch: remove valores isolados (janela que
 * pega a transição entre duas notas, ataque, quebra) com atraso de 1 leitura.
 * Com menos de 3 leituras válidas seguidas, devolve a atual.
 */
export function medianaDe3(recentes: (number | null)[]): number | null {
  const ultimos = recentes.slice(-3);
  const atual = ultimos[ultimos.length - 1] ?? null;
  if (atual === null || ultimos.length < 3 || ultimos.some((v) => v === null)) return atual;
  const ordenados = (ultimos as number[]).slice().sort((x, y) => x - y);
  return ordenados[1] ?? atual;
}

/** Suavização simples para a leitura na tela (não altera o que é registrado). */
export function suavizar(anterior: number | null, novo: number, fator = 0.35): number {
  return anterior === null ? novo : anterior + fator * (novo - anterior);
}
