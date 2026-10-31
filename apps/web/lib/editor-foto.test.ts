import { describe, expect, it } from "vitest";

import { AJUSTES_INICIAIS, escalaCobrir, filtroCss, ladosGirados, limitarPosicao } from "@/lib/editor-foto";

describe("editor de foto", () => {
  it("cobre o quadro: a menor dimensão (já girada) ocupa o lado inteiro", () => {
    expect(escalaCobrir(1280, 720, 0, 640, 1)).toBeCloseTo(640 / 720, 6);
    expect(ladosGirados(1280, 720, 90)).toEqual([720, 1280]);
    expect(escalaCobrir(1280, 720, 90, 640, 1)).toBeCloseTo(640 / 720, 6);
    expect(escalaCobrir(1000, 1000, 0, 640, 2)).toBeCloseTo(1.28, 6);
    expect(escalaCobrir(1000, 1000, 0, 640, 99)).toBeCloseTo(0.64 * 4, 6); // zoom limitado a 4×
  });

  it("nunca deixa borda vazia ao arrastar", () => {
    // 1280×720 cobrindo 640: largura desenhada ≈ 1137,8 → folga horizontal ≈ 248,9; vertical 0
    const a = limitarPosicao({ ...AJUSTES_INICIAIS, x: 9999, y: 50 }, 1280, 720, 640);
    expect(a.x).toBeCloseTo((1280 * (640 / 720) - 640) / 2, 4);
    expect(a.y).toBe(0);
    const b = limitarPosicao({ ...AJUSTES_INICIAIS, x: -9999, y: -9999, zoom: 2 }, 1000, 1000, 640);
    expect(b.x).toBeCloseTo(-320, 6);
    expect(b.y).toBeCloseTo(-320, 6);
  });

  it("filtro de cor e estilos", () => {
    expect(filtroCss(AJUSTES_INICIAIS)).toBe("brightness(1) contrast(1) saturate(1)");
    expect(filtroCss({ ...AJUSTES_INICIAIS, brilho: 20, contraste: -10, saturacao: -100, estilo: "pb" }))
      .toBe("brightness(1.2) contrast(0.9) saturate(0) grayscale(1)");
  });
});
