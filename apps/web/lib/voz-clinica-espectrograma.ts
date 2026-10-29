/**
 * VoiceCheck IA 2.0 — espectrograma (cálculo puro, testável).
 *
 * Banda larga (janela curta, ~5 ms): mostra formantes.
 * Banda estreita (janela longa, ~30 ms): mostra harmônicos e o contorno de F0.
 */

/** FFT radix-2 in-place (re/im com tamanho potência de 2). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new RangeError("tamanho precisa ser potência de 2");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let tam = 2; tam <= n; tam <<= 1) {
    const ang = (-2 * Math.PI) / tam;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let ini = 0; ini < n; ini += tam) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < tam / 2; k++) {
        const a = ini + k;
        const b = a + tam / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export type Espectrograma = {
  /** dB relativos ao máximo (0 = mais forte), quadros × faixas, linha a linha. */
  db: Float32Array;
  quadros: number;
  faixas: number;
  /** Segundos entre quadros e Hz entre faixas. */
  dt: number;
  df: number;
  /** Instante (s) do centro do primeiro quadro. */
  t0: number;
};

export type OpcoesEspectro = { janela_ms: number; passo_ms?: number; fmax?: number; preEnfase?: boolean };

export const BANDA_LARGA: OpcoesEspectro = { janela_ms: 5, passo_ms: 2, fmax: 5000, preEnfase: true };
export const BANDA_ESTREITA: OpcoesEspectro = { janela_ms: 30, passo_ms: 5, fmax: 5000, preEnfase: true };

/** Espectrograma com janela de Gauss (como o Praat), em dB relativos ao máximo. */
export function calcularEspectrograma(amostras: Float32Array, taxa: number, op: OpcoesEspectro): Espectrograma {
  const tamJanela = Math.max(16, Math.round((op.janela_ms / 1000) * taxa));
  const passo = Math.max(1, Math.round(((op.passo_ms ?? op.janela_ms / 4) / 1000) * taxa));
  // preenchimento com zeros até ~25 Hz por faixa: imagem lisa também na banda larga
  let nfft = 1;
  while (nfft < tamJanela * 2 || taxa / nfft > 25) nfft <<= 1;
  const df = taxa / nfft;
  const fmax = Math.min(op.fmax ?? taxa / 2, taxa / 2);
  const faixas = Math.max(1, Math.floor(fmax / df));
  const quadros = Math.max(0, Math.floor((amostras.length - tamJanela) / passo) + 1);

  // pré-ênfase (+6 dB/oitava acima de ~50 Hz): deixa os formantes agudos visíveis
  let x = amostras;
  if (op.preEnfase) {
    const a = Math.exp((-2 * Math.PI * 50) / taxa);
    x = new Float32Array(amostras.length);
    x[0] = amostras[0] ?? 0;
    for (let i = 1; i < amostras.length; i++) x[i] = (amostras[i] ?? 0) - a * (amostras[i - 1] ?? 0);
  }

  const janela = new Float64Array(tamJanela);
  const meio = (tamJanela - 1) / 2;
  const sigma = tamJanela / 6;
  for (let i = 0; i < tamJanela; i++) janela[i] = Math.exp(-0.5 * ((i - meio) / sigma) ** 2);

  const potencia = new Float32Array(quadros * faixas);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  let maior = 1e-20;
  for (let q = 0; q < quadros; q++) {
    re.fill(0);
    im.fill(0);
    const ini = q * passo;
    for (let i = 0; i < tamJanela; i++) re[i] = (x[ini + i] ?? 0) * janela[i]!;
    fft(re, im);
    for (let k = 0; k < faixas; k++) {
      const p = re[k]! * re[k]! + im[k]! * im[k]!;
      potencia[q * faixas + k] = p;
      if (p > maior) maior = p;
    }
  }
  const db = new Float32Array(potencia.length);
  for (let i = 0; i < potencia.length; i++) db[i] = 10 * Math.log10((potencia[i]! + 1e-20) / maior);
  return { db, quadros, faixas, dt: passo / taxa, df, t0: tamJanela / 2 / taxa };
}

/** Lê WAV PCM 16 bits mono (o formato que o gravador gera). */
export function lerWavPcm16(buf: ArrayBuffer): { amostras: Float32Array; taxa: number } {
  const v = new DataView(buf);
  const txt = (p: number) => String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
  if (buf.byteLength < 44 || txt(0) !== "RIFF" || txt(8) !== "WAVE") throw new Error("Arquivo não é WAV.");
  let pos = 12;
  let taxa = 0;
  let canais = 1;
  let bits = 0;
  while (pos + 8 <= buf.byteLength) {
    const id = txt(pos);
    const tam = v.getUint32(pos + 4, true);
    if (id === "fmt ") {
      canais = v.getUint16(pos + 10, true);
      taxa = v.getUint32(pos + 12, true);
      bits = v.getUint16(pos + 22, true);
    } else if (id === "data") {
      if (bits !== 16) throw new Error("Só WAV de 16 bits é suportado aqui.");
      const n = Math.floor(Math.min(tam, buf.byteLength - pos - 8) / 2 / canais);
      const amostras = new Float32Array(n);
      for (let i = 0; i < n; i++) amostras[i] = v.getInt16(pos + 8 + i * 2 * canais, true) / 32768;
      return { amostras, taxa };
    }
    pos += 8 + tam + (tam % 2);
  }
  throw new Error("WAV sem dados de áudio.");
}

/**
 * Escala sequencial de um matiz (escuro → turquesa → quase branco) para fundo escuro.
 * `v` em 0..1 (0 = silêncio, 1 = mais forte). Devolve [r, g, b].
 */
export function corSequencial(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  const paradas: [number, [number, number, number]][] = [
    [0, [11, 17, 32]],      // fundo do painel
    [0.45, [14, 92, 99]],   // turquesa escuro
    [0.8, [32, 217, 210]],  // turquesa do produto
    [1, [230, 255, 253]],   // quase branco
  ];
  for (let i = 1; i < paradas.length; i++) {
    const [t1, c1] = paradas[i]!;
    const [t0, c0] = paradas[i - 1]!;
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j]! + (c1[j]! - c0[j]!) * k)) as [number, number, number];
    }
  }
  return paradas[paradas.length - 1]![1];
}
