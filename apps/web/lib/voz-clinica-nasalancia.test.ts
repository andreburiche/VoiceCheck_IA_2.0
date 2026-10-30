import { describe, expect, it } from "vitest";

import { analisarNasalancia, passaBanda } from "@/lib/voz-clinica-nasalancia";

const TAXA = 16000;
const seno = (f: number, amp: number, dur = 2) => Float32Array.from({ length: TAXA * dur }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / TAXA));

describe("nasalância", () => {
  it("passa-banda deixa 500 Hz e corta 100 Hz e 3 kHz", () => {
    const r = (x: Float32Array) => Math.sqrt(x.slice(4000).reduce((s, v) => s + v * v, 0) / (x.length - 4000));
    expect(r(passaBanda(seno(500, 1), TAXA))).toBeCloseTo(Math.SQRT1_2, 1);
    expect(r(passaBanda(seno(100, 1), TAXA)) < 0.05).toBe(true);
    expect(r(passaBanda(seno(3000, 1), TAXA)) < 0.05).toBe(true);
  });

  it("mesma amplitude nos dois canais = 50 %; nasal 1/3 da oral = 25 %", () => {
    expect(analisarNasalancia(seno(500, 0.4), seno(500, 0.4), TAXA)!.media_pct).toBeCloseTo(50, 0);
    const r = analisarNasalancia(seno(500, 0.6), seno(500, 0.2), TAXA)!;
    expect(r.media_pct).toBeCloseTo(25, 0);
    expect(r.dp_pct < 1).toBe(true);
  });

  it("silêncio não entra; gravação curta ou muda devolve null", () => {
    const o = seno(500, 0.6, 3), z = seno(500, 0.2, 3);
    o.fill(0, TAXA, 2 * TAXA); z.fill(0, TAXA, 2 * TAXA); // 1 s de silêncio no meio
    const r = analisarNasalancia(o, z, TAXA)!;
    expect(r.quadros).toBeLessThanOrEqual(101);
    expect(r.media_pct).toBeCloseTo(25, 0);
    expect(analisarNasalancia(new Float32Array(TAXA * 2), new Float32Array(TAXA * 2), TAXA)).toBeNull();
    expect(analisarNasalancia(seno(500, 1, 0.2 as never), seno(500, 1, 0.2 as never), TAXA)).toBeNull();
  });
});
