import { describe, expect, it } from "vitest";

import {
  BANDA_ESTREITA,
  BANDA_LARGA,
  calcularEspectrograma,
  corSequencial,
  fft,
  lerWavPcm16,
} from "@/lib/voz-clinica-espectrograma";
import { codificarWav } from "@/lib/voz-clinica-wav";

const TAXA = 48000;
const seno = (hz: number, s: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(TAXA * s) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / TAXA));

/** Faixa de maior energia num quadro. */
function pico(e: ReturnType<typeof calcularEspectrograma>, q: number): number {
  let melhor = 0;
  for (let k = 1; k < e.faixas; k++) if (e.db[q * e.faixas + k]! > e.db[q * e.faixas + melhor]!) melhor = k;
  return melhor * e.df;
}

describe("fft", () => {
  it("seno puro concentra energia na faixa certa", () => {
    const n = 64;
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]!));
    expect(Math.round(mag[5]!)).toBe(32);
    expect(mag[7]! < 1e-9).toBe(true);
  });
  it("recusa tamanho que não é potência de 2", () => {
    expect(() => fft(new Float64Array(10), new Float64Array(10))).toThrow(RangeError);
  });
});

describe("calcularEspectrograma", () => {
  it("acha a frequência de um seno (banda estreita, erro < 1 faixa)", () => {
    const e = calcularEspectrograma(seno(1000, 0.5), TAXA, BANDA_ESTREITA);
    expect(Math.abs(pico(e, Math.floor(e.quadros / 2)) - 1000) <= e.df).toBe(true);
    expect(e.faixas * e.df <= 5000).toBe(true);
  });

  it("banda estreita separa harmônicos que a larga junta", () => {
    // 150 Hz e 300 Hz juntos
    const x = Float32Array.from(seno(150, 0.5), (v, i) => v + seno(300, 0.5)[i]!);
    const estreita = calcularEspectrograma(x, TAXA, { ...BANDA_ESTREITA, preEnfase: false });
    const larga = calcularEspectrograma(x, TAXA, { ...BANDA_LARGA, preEnfase: false });
    // profundidade do vale entre os harmônicos, relativa ao mais fraco dos dois picos
    const vale = (e: typeof estreita) => {
      const q = Math.floor(e.quadros / 2);
      const nivel = (hz: number) => e.db[q * e.faixas + Math.round(hz / e.df)]!;
      return Math.min(nivel(150), nivel(300)) - nivel(225);
    };
    expect(vale(estreita) > 20).toBe(true); // vale profundo: harmônicos visíveis
    expect(vale(larga) < 6).toBe(true); // sem vale: a banda larga funde os harmônicos
  });

  it("o máximo vale 0 dB e o tempo bate com a duração", () => {
    const e = calcularEspectrograma(seno(440, 2), TAXA, BANDA_LARGA);
    const maximo = e.db.reduce((m, v) => (v > m ? v : m), -Infinity);
    expect(Math.abs(maximo) < 1e-5).toBe(true);
    expect(Math.abs(e.t0 + (e.quadros - 1) * e.dt - 2) < 0.01).toBe(true);
  });
});

describe("lerWavPcm16", () => {
  it("lê o WAV do próprio gravador", () => {
    const x = seno(220, 0.1, 0.25);
    const r = lerWavPcm16(codificarWav(x, TAXA));
    expect(r.taxa).toBe(TAXA);
    expect(r.amostras.length).toBe(x.length);
    expect(Math.abs(r.amostras[100]! - x[100]!) < 1e-4).toBe(true);
  });
  it("recusa o que não é WAV", () => {
    expect(() => lerWavPcm16(new ArrayBuffer(100))).toThrow(Error);
  });
});

describe("corSequencial", () => {
  it("vai do fundo escuro ao quase branco, cada vez mais claro", () => {
    const luz = (v: number) => corSequencial(v).reduce((s, c) => s + c, 0);
    expect(corSequencial(0)).toEqual([11, 17, 32]);
    expect(corSequencial(1)).toEqual([230, 255, 253]);
    for (let v = 0.1; v <= 1; v += 0.1) expect(luz(v) >= luz(v - 0.1)).toBe(true);
  });
});
