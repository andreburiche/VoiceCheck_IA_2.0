/**
 * VoiceCheck IA — voz de exemplo da página inicial.
 *
 * As animações da landing não desenham curvas inventadas (DESIGN.md, Live Reading Rule): geram
 * uma frase cantada sintética, sempre igual, e a MEDEM no navegador com as mesmas funções da
 * avaliação clínica (espectrograma, YIN, nível). O que aparece na tela é medição de verdade de
 * uma voz de exemplo — e a página diz isso.
 */
import { nivelDbfs, pitchYin } from "@/lib/voz-clinica-biofeedback";

export const TAXA_EXEMPLO = 16_000;

/** Notas da frase (Hz) e duração de cada uma (s): sobe, sustenta, desce — como um exercício vocal. */
const FRASE: [number, number][] = [
  [196.0, 0.55], // G3
  [220.0, 0.55], // A3
  [246.9, 0.55], // B3
  [293.7, 0.9], // D4 (sustentada, com vibrato)
  [246.9, 0.5], // B3
  [220.0, 0.5], // A3
  [196.0, 0.8], // G3
];
const PAUSA_S = 0.35;

/** Gerador pseudoaleatório determinístico (a voz sai igual em toda visita). */
function prng(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Envelope espectral de um /a/ (formantes ≈ 750, 1200, 2600 Hz). */
function envelopeA(f: number): number {
  const ressonancia = (fc: number, bw: number) => 1 / (1 + ((f - fc) / bw) ** 2);
  return 0.9 * ressonancia(750, 110) + 0.55 * ressonancia(1200, 140) + 0.25 * ressonancia(2700, 220) + 0.006;
}

export type VozExemplo = { amostras: Float32Array; taxa: number; duracao: number; notas: { inicio: number; fim: number; hz: number }[] };

/** Frase sintética: deslizes curtos entre as notas, vibrato de 5,5 Hz, jitter e shimmer pequenos e um pouco de ar. */
export function vozDeExemplo(taxa = TAXA_EXEMPLO): VozExemplo {
  const aleatorio = prng(20261030);
  const total = FRASE.reduce((s, [, d]) => s + d, 0) + PAUSA_S;
  const n = Math.round(total * taxa);
  const x = new Float32Array(n);
  const notas: VozExemplo["notas"] = [];
  let t0 = 0;
  for (const [hz, dur] of FRASE) { notas.push({ inicio: t0, fim: t0 + dur, hz }); t0 += dur; }
  let fase = 0;
  let jitter = 0;
  let ultimoCiclo = 0;
  let amp = 1;
  const harmonicos = 24;
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    const k = notas.findIndex((nota) => t >= nota.inicio && t < nota.fim);
    if (k < 0) { x[i] = 0; continue; }
    const nota = notas[k]!;
    const anterior = notas[k - 1];
    // deslize de 60 ms vindo da nota anterior
    const desl = anterior ? Math.min(1, (t - nota.inicio) / 0.06) : 1;
    const base = anterior ? anterior.hz * (nota.hz / anterior.hz) ** (desl * desl * (3 - 2 * desl)) : nota.hz;
    const vib = 1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, (t - nota.inicio) / 0.25);
    const f0 = base * vib * (1 + jitter);
    fase += (2 * Math.PI * f0) / taxa;
    if (fase - ultimoCiclo >= 2 * Math.PI) { // novo ciclo: sorteia jitter e shimmer
      ultimoCiclo = fase;
      jitter = (aleatorio() - 0.5) * 0.008;
      amp = 1 + (aleatorio() - 0.5) * 0.06;
    }
    let s = 0;
    for (let h = 1; h <= harmonicos; h++) {
      const fh = f0 * h;
      if (fh > taxa / 2 - 200) break;
      s += (envelopeA(fh) / h) * Math.sin(h * fase); // fonte glótica: −6 dB por oitava
    }
    const ataque = Math.min(1, (t - notas[0]!.inicio) / 0.04, (notas.at(-1)!.fim - t) / 0.08);
    x[i] = (s * amp + (aleatorio() - 0.5) * 0.04) * Math.max(0, ataque);
  }
  let pico = 0;
  for (const v of x) pico = Math.max(pico, Math.abs(v));
  for (let i = 0; i < n; i++) x[i] = (x[i]! / pico) * 0.5;
  return { amostras: x, taxa, duracao: n / taxa, notas };
}

export type LeituraExemplo = { t: number; hz: number | null; db: number };

/** F0 (YIN) e nível a cada 10 ms — as mesmas funções do biofeedback e do fonetograma. */
export function medirExemplo(voz: VozExemplo, passo_s = 0.01): LeituraExemplo[] {
  const janela = Math.round(0.04 * voz.taxa);
  const passo = Math.round(passo_s * voz.taxa);
  const leituras: LeituraExemplo[] = [];
  for (let i = 0; i + janela <= voz.amostras.length; i += passo) {
    const trecho = voz.amostras.subarray(i, i + janela);
    const r = pitchYin(trecho, voz.taxa, 70, 900);
    leituras.push({ t: (i + janela / 2) / voz.taxa, hz: r?.hz ?? null, db: nivelDbfs(trecho) });
  }
  return leituras;
}

/** Nome da nota (C4 = dó central) a partir da frequência. */
export function notaDe(hz: number): string {
  const nomes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${nomes[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

let cache: { voz: VozExemplo; leituras: LeituraExemplo[] } | null = null;

/** A voz de exemplo e as leituras dela, calculadas uma vez por página. */
export function obterExemplo() {
  if (!cache) {
    const voz = vozDeExemplo();
    cache = { voz, leituras: medirExemplo(voz) };
  }
  return cache;
}

/** Envoltória da forma de onda (pico por coluna), para desenhar em SVG. */
export function envoltoria(voz: VozExemplo, colunas = 240): number[] {
  const por = Math.floor(voz.amostras.length / colunas);
  const v: number[] = [];
  for (let c = 0; c < colunas; c++) {
    let pico = 0;
    for (let i = c * por; i < (c + 1) * por; i++) pico = Math.max(pico, Math.abs(voz.amostras[i]!));
    v.push(pico);
  }
  const max = Math.max(...v, 1e-9);
  return v.map((x) => x / max);
}

export type MedidasExemplo = { f0_media_hz: number; extensao_st: number; vibrato_hz: number | null; vibrato_cents: number | null; voz_s: number };

/** Medidas da frase de exemplo, calculadas das leituras (não digitadas). */
export function medidasExemplo(voz: VozExemplo, leituras: LeituraExemplo[]): MedidasExemplo {
  const comVoz = leituras.filter((l) => l.hz !== null) as (LeituraExemplo & { hz: number })[];
  const hz = comVoz.map((l) => l.hz);
  const media = hz.reduce((s, x) => s + x, 0) / Math.max(1, hz.length);
  const ordenado = [...hz].sort((a, b) => a - b);
  const p = (q: number) => ordenado[Math.floor(q * (ordenado.length - 1))] ?? 0;
  const extensao = 12 * Math.log2(p(0.97) / p(0.03));
  // vibrato na nota mais longa: frequência pelos cruzamentos da F0 com a média, extensão em cents
  const longa = [...voz.notas].sort((a, b) => (b.fim - b.inicio) - (a.fim - a.inicio))[0]!;
  const trecho = comVoz.filter((l) => l.t > longa.inicio + 0.3 && l.t < longa.fim - 0.05);
  let vibrato_hz: number | null = null;
  let vibrato_cents: number | null = null;
  if (trecho.length > 20) {
    const cents = trecho.map((l) => 1200 * Math.log2(l.hz / longa.hz));
    const m = cents.reduce((s, x) => s + x, 0) / cents.length;
    let cruzamentos = 0;
    for (let i = 1; i < cents.length; i++) if ((cents[i - 1]! - m) * (cents[i]! - m) < 0) cruzamentos++;
    const dur = trecho.at(-1)!.t - trecho[0]!.t;
    vibrato_hz = cruzamentos / 2 / dur;
    vibrato_cents = (Math.max(...cents) - Math.min(...cents)) / 2;
  }
  return { f0_media_hz: media, extensao_st: extensao, vibrato_hz, vibrato_cents, voz_s: comVoz.length * 0.01 };
}

export type TrechoCiclos = { amostras: number[]; inicio_s: number; picos: number[]; periodos_ms: number[] };

/**
 * Alguns milissegundos da nota sustentada, com o pico de cada ciclo glótico: os mesmos picos
 * que o jitter compara (a duração de um ciclo para o seguinte). Pico refinado por parábola.
 */
export function ciclosDoExemplo(voz: VozExemplo, leituras: LeituraExemplo[], duracao_ms = 24): TrechoCiclos {
  const longa = [...voz.notas].sort((a, b) => (b.fim - b.inicio) - (a.fim - a.inicio))[0]!;
  const inicio_s = longa.inicio + 0.45;
  const i0 = Math.round(inicio_s * voz.taxa);
  const n = Math.round((duracao_ms / 1000) * voz.taxa);
  const trecho = Array.from(voz.amostras.subarray(i0, i0 + n));
  const hz = leituras.find((l) => l.t >= inicio_s && l.hz !== null)?.hz ?? longa.hz;
  const periodo = voz.taxa / hz;
  const picoEm = (de: number, ate: number) => {
    let melhor = Math.max(1, de);
    for (let i = Math.max(1, de); i < Math.min(trecho.length - 1, ate); i++) if (trecho[i]! > trecho[melhor]!) melhor = i;
    const [a, b, c] = [trecho[melhor - 1]!, trecho[melhor]!, trecho[melhor + 1]!];
    const den = a - 2 * b + c;
    return melhor + (den !== 0 ? (0.5 * (a - c)) / den : 0);
  };
  // primeiro ciclo pelo pico; os seguintes pela correlação com o ciclo anterior (refinada por
  // parábola): mede o período inteiro, não um pico isolado que os harmônicos deslocam
  const picos = [picoEm(0, Math.round(periodo))];
  const corr = (a: number, defasagem: number) => {
    const n0 = Math.floor(periodo);
    let soma = 0, ea = 0, eb = 0;
    for (let i = 0; i < n0; i++) {
      const xa = interp(a + i), xb = interp(a + defasagem + i);
      soma += xa * xb; ea += xa * xa; eb += xb * xb;
    }
    return soma / Math.sqrt(ea * eb || 1);
  };
  function interp(t: number) {
    const i = Math.floor(t), f = t - i;
    return (trecho[i] ?? 0) * (1 - f) + (trecho[i + 1] ?? 0) * f;
  }
  while (true) {
    const a = picos.at(-1)!;
    if (a + 2 * periodo * 1.15 >= trecho.length - 1) break;
    let melhor = Math.round(periodo), vMelhor = -Infinity;
    for (let L = Math.round(periodo * 0.85); L <= Math.round(periodo * 1.15); L++) {
      const v = corr(a, L);
      if (v > vMelhor) { vMelhor = v; melhor = L; }
    }
    const [y0, y1, y2] = [corr(a, melhor - 1), vMelhor, corr(a, melhor + 1)];
    const den = y0 - 2 * y1 + y2;
    picos.push(a + melhor + (den !== 0 ? (0.5 * (y0 - y2)) / den : 0));
  }
  const periodos_ms = picos.slice(1).map((p, i) => ((p - picos[i]!) / voz.taxa) * 1000);
  return { amostras: trecho, inicio_s, picos, periodos_ms };
}
