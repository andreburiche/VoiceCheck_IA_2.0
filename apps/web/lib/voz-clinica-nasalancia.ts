/**
 * VoiceCheck IA 2.0 — nasalância (como o Nasometer e o módulo de nasalância do lingWAVES).
 *
 * Precisa de dois microfones separados por uma placa (um na frente da boca, outro do nariz)
 * ligados num gravador/interface ESTÉREO. Por quadro de 20 ms, depois de filtrar os dois canais
 * em torno de 500 Hz (como o Nasometer, 350–650 Hz):
 *     nasalância (%) = 100 × N / (N + O)
 * com N e O o RMS (amplitude) do canal nasal e do oral. Só entram quadros com som.
 * Puro e testável; a captura fica no componente.
 */

export const BANDA_HZ = { min: 350, max: 650 } as const;
export const QUADRO_S = 0.02;
/** Quadros mais de 35 dB abaixo do mais forte contam como silêncio. */
export const SILENCIO_DB = 35;

export type ResultadoNasalancia = {
  media_pct: number;
  dp_pct: number;
  mediana_pct: number;
  /** Quadros com som (cada um com 20 ms). */
  quadros: number;
  duracao_s: number;
  /** Nasalância por quadro com som, para o gráfico (no máximo 400 pontos). */
  curva: { t: number; pct: number }[];
};

/** Filtro passa-banda (biquad RBJ, ganho 0 dB no pico), aplicado duas vezes (4ª ordem). */
export function passaBanda(x: Float32Array, taxa: number, f1 = BANDA_HZ.min, f2 = BANDA_HZ.max): Float32Array {
  const f0 = Math.sqrt(f1 * f2);
  const q = f0 / (f2 - f1);
  const w0 = (2 * Math.PI * f0) / taxa;
  const alfa = Math.sin(w0) / (2 * q);
  const a0 = 1 + alfa;
  const b0 = alfa / a0, b2 = -alfa / a0;
  const a1 = (-2 * Math.cos(w0)) / a0, a2 = (1 - alfa) / a0;
  let y = x;
  for (let passe = 0; passe < 2; passe++) {
    const s = new Float32Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const xi = y[i]!;
      const yi = b0 * xi + b2 * x2 - a1 * y1 - a2 * y2;
      s[i] = yi;
      x2 = x1; x1 = xi; y2 = y1; y1 = yi;
    }
    y = s;
  }
  return y;
}

function rms(x: Float32Array, i0: number, i1: number): number {
  let s = 0;
  for (let i = i0; i < i1; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, i1 - i0));
}

export function analisarNasalancia(oral: Float32Array, nasal: Float32Array, taxa: number): ResultadoNasalancia | null {
  const n = Math.min(oral.length, nasal.length);
  if (n < taxa * 0.5) return null;
  const o = passaBanda(oral.subarray(0, n), taxa);
  const z = passaBanda(nasal.subarray(0, n), taxa);
  const passo = Math.round(QUADRO_S * taxa);
  const quadros: { t: number; o: number; z: number }[] = [];
  for (let i = 0; i + passo <= n; i += passo) quadros.push({ t: i / taxa, o: rms(o, i, i + passo), z: rms(z, i, i + passo) });
  const forte = Math.max(...quadros.map((q) => q.o + q.z), 1e-12);
  const limiar = forte * 10 ** (-SILENCIO_DB / 20);
  const validos = quadros.filter((q) => q.o + q.z >= limiar && q.o + q.z > 1e-6);
  if (validos.length < 10) return null;
  const pcts = validos.map((q) => (100 * q.z) / (q.z + q.o));
  const media = pcts.reduce((s, v) => s + v, 0) / pcts.length;
  const dp = Math.sqrt(pcts.reduce((s, v) => s + (v - media) ** 2, 0) / pcts.length);
  const ord = [...pcts].sort((a, b) => a - b);
  const mediana = ord.length % 2 ? ord[(ord.length - 1) / 2]! : (ord[ord.length / 2 - 1]! + ord[ord.length / 2]!) / 2;
  const passoCurva = Math.max(1, Math.ceil(validos.length / 400));
  const curva = validos.filter((_, i) => i % passoCurva === 0).map((q) => ({ t: Math.round(q.t * 100) / 100, pct: Math.round((1000 * q.z) / (q.z + q.o)) / 10 }));
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { media_pct: r1(media), dp_pct: r1(dp), mediana_pct: r1(mediana), quadros: validos.length, duracao_s: Math.round((n / taxa) * 100) / 100, curva };
}

/** Estímulos de leitura em português (o profissional escolhe; sem norma embutida). */
export const TAREFAS_NASALANCIA = {
  oral: { rotulo: "Texto oral", exemplo: "Papai pegou a pipa azul e o boné do Beto." },
  nasal: { rotulo: "Texto nasal", exemplo: "Mamãe mandou a menina comer manga e melão." },
  balanceado: { rotulo: "Texto balanceado", exemplo: "Leitura de um texto com sons orais e nasais." },
  vogal: { rotulo: "Vogal sustentada", exemplo: "/a/ ou /i/ sustentado por 3 a 5 segundos." },
  outro: { rotulo: "Outro", exemplo: "" },
} as const;
export type TarefaNasalancia = keyof typeof TAREFAS_NASALANCIA;
