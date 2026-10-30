import { describe, expect, it } from "vitest";

import { caminhoSvg, dominioArredondado, histogramaF0 } from "@/lib/voz-clinica-graficos";

describe("histogramaF0", () => {
  it("conta, acha a moda e ignora quadros sem voz", () => {
    const f0 = [null, 200, 201, 201.5, 203, 210, null, 199];
    const h = histogramaF0(f0);
    expect(h.quadros).toBe(6);
    expect(h.barras[0]!.de).toBe(198);
    expect(h.moda_hz).toBe(201); // barra 200–202 tem 3 quadros
    expect(h.barras.reduce((s, b) => s + b.n, 0)).toBe(6);
    expect(Math.round(h.media_hz! * 10) / 10).toBe(202.4);
  });

  it("faixa larga vira cerca de 30 barras", () => {
    const f0 = Array.from({ length: 300 }, (_, i) => 100 + i);
    const h = histogramaF0(f0);
    expect(h.barras.length).toBeLessThanOrEqual(31);
    expect(h.barras[0]!.ate - h.barras[0]!.de).toBe(10);
  });

  it("sem voz", () => {
    expect(histogramaF0([null, null])).toEqual({ barras: [], moda_hz: null, media_hz: null, quadros: 0 });
  });
});

describe("caminhoSvg", () => {
  it("quebra a linha nos trechos sem voz", () => {
    expect(caminhoSvg([0, 10, null, 5, 10], 40, 10, [0, 10])).toBe("M0.0 10.0L10.0 0.0M30.0 5.0L40.0 0.0");
  });
});

describe("dominioArredondado", () => {
  it("arredonda e garante largura mínima", () => {
    expect(dominioArredondado([203, 207, null], 10, 50)).toEqual([180, 230]);
    expect(dominioArredondado([-42, -3], 10)).toEqual([-50, 0]);
  });
});
