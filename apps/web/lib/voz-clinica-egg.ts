/**
 * VoiceCheck IA 2.0 — eletroglotografia (EGG): quociente de contato (CQ) por ciclo,
 * como o módulo de EGG do lingWAVES. O sinal do eletroglotógrafo chega por um canal de um
 * WAV estéreo (o outro canal costuma ser a voz).
 *
 * Método do nível-critério (Rothenberg & Mahshie, 1988; Howard, 1995): em cada ciclo, a fase
 * de contato é o tempo em que o sinal fica acima de min + k·(máx − min); CQ = contato / período.
 * Convenção: mais contato = sinal para cima (há aparelhos que invertem: use "inverter polaridade").
 * Antes, um passa-alta de 20 Hz tira a deriva lenta (movimento da laringe).
 */

export type ResultadoEgg = {
  cq_media_pct: number;
  cq_dp_pct: number;
  cq_mediana_pct: number;
  f0_media_hz: number;
  ciclos: number;
  duracao_s: number;
  /** CQ por ciclo para o gráfico (no máximo 400 pontos). */
  curva: { t: number; cq: number }[];
};

export const LIMIARES_EGG = [0.25, 0.35, 0.5] as const;

/** Passa-alta de 1ª ordem (tira deriva lenta). */
export function passaAlta(x: Float32Array, taxa: number, fc = 20): Float32Array {
  const rc = 1 / (2 * Math.PI * fc);
  const a = rc / (rc + 1 / taxa);
  const y = new Float32Array(x.length);
  let px = x[0] ?? 0, py = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    py = a * (py + xi - px);
    px = xi;
    y[i] = py;
  }
  return y;
}

export function analisarEgg(
  sinal: Float32Array,
  taxa: number,
  opcoes: { limiar?: number; inverter?: boolean; f0Min?: number; f0Max?: number } = {},
): ResultadoEgg | null {
  const k = opcoes.limiar ?? 0.35;
  const f0Min = opcoes.f0Min ?? 60, f0Max = opcoes.f0Max ?? 1000;
  if (sinal.length < taxa * 0.3) return null;
  let x = passaAlta(sinal, taxa);
  if (opcoes.inverter) x = x.map((v) => -v);
  // começos de ciclo: subidas pelo zero com histerese (evita ruído perto do zero)
  let pico = 0;
  for (let i = 0; i < x.length; i++) pico = Math.max(pico, Math.abs(x[i]!));
  if (pico < 1e-4) return null;
  const hist = 0.05 * pico;
  const subidas: number[] = [];
  let abaixo = true;
  for (let i = 1; i < x.length; i++) {
    if (abaixo && x[i - 1]! < 0 && x[i]! >= 0) { subidas.push(i); abaixo = false; }
    else if (!abaixo && x[i]! < -hist) abaixo = true;
  }
  const ciclos: { t: number; cq: number; f0: number }[] = [];
  for (let c = 0; c + 1 < subidas.length; c++) {
    const s = subidas[c]!, e = subidas[c + 1]!;
    const T = e - s;
    const f0 = taxa / T;
    if (f0 < f0Min || f0 > f0Max) continue;
    let mn = Infinity, mx = -Infinity;
    for (let i = s; i < e; i++) { mn = Math.min(mn, x[i]!); mx = Math.max(mx, x[i]!); }
    if (mx - mn < 0.1 * pico) continue; // ciclo fraco demais (início/fim da fonação)
    const th = mn + k * (mx - mn);
    let contato = 0;
    for (let i = s; i < e; i++) if (x[i]! > th) contato++;
    ciclos.push({ t: s / taxa, cq: contato / T, f0 });
  }
  if (ciclos.length < 5) return null;
  // ciclos com período muito diferente dos vizinhos (erro de detecção) ficam fora, como no jitter
  const ok = ciclos.filter((c, i) => {
    const viz = [ciclos[i - 1], ciclos[i + 1]].filter(Boolean) as typeof ciclos;
    return viz.every((v) => Math.max(v.f0, c.f0) / Math.min(v.f0, c.f0) <= 1.3);
  });
  if (ok.length < 5) return null;
  const cqs = ok.map((c) => 100 * c.cq);
  const media = cqs.reduce((s, v) => s + v, 0) / cqs.length;
  const dp = Math.sqrt(cqs.reduce((s, v) => s + (v - media) ** 2, 0) / cqs.length);
  const ord = [...cqs].sort((a, b) => a - b);
  const mediana = ord.length % 2 ? ord[(ord.length - 1) / 2]! : (ord[ord.length / 2 - 1]! + ord[ord.length / 2]!) / 2;
  const f0 = ok.reduce((s, c) => s + c.f0, 0) / ok.length;
  const passo = Math.max(1, Math.ceil(ok.length / 400));
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    cq_media_pct: r1(media), cq_dp_pct: r1(dp), cq_mediana_pct: r1(mediana), f0_media_hz: r1(f0),
    ciclos: ok.length, duracao_s: Math.round((sinal.length / taxa) * 100) / 100,
    curva: ok.filter((_, i) => i % passo === 0).map((c) => ({ t: Math.round(c.t * 1000) / 1000, cq: r1(100 * c.cq) })),
  };
}
