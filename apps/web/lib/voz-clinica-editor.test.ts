import { describe, expect, it } from "vitest";

import { apagarTrecho, colunasMinMax, normalizarSelecao, segTexto, textoSeg, zoom } from "@/lib/voz-clinica-editor";

describe("editor de áudio", () => {
  it("min/max por coluna só da janela visível", () => {
    const x = Float32Array.from([0, 0.5, -0.25, 0, 1, -1, 0.1, 0]);
    const { min, max } = colunasMinMax(x, 4, { ini: 0, fim: 1 }, 2); // 4 amostras = 1 s
    expect(Array.from(max)).toEqual([0.5, 0]);
    expect(Array.from(min)).toEqual([0, -0.25]);
    const z = colunasMinMax(x, 4, { ini: 1, fim: 2 }, 2);
    expect(Array.from(z.max)).toEqual([1, 0.10000000149011612]);
  });

  it("seleção em ordem, limitada e com tamanho mínimo", () => {
    expect(normalizarSelecao(3, 1, 2.5)).toEqual({ ini: 1, fim: 2.5 });
    expect(normalizarSelecao(1, 1.01, 5)).toBe(null);
  });

  it("apagar trecho junta o resto com transição suave", () => {
    const x = new Float32Array(1000).fill(1);
    const y = apagarTrecho(x, 1000, { ini: 0.2, fim: 0.5 });
    expect(y.length).toBe(700);
    expect(y[100]).toBe(1);
    expect(y[200]).toBe(0); // emenda começa do zero
    expect(y[199]! < 0.25).toBe(true);
    expect(y[600]).toBe(1);
  });

  it("zoom fica dentro da gravação", () => {
    expect(zoom({ ini: 0, fim: 10 }, 0.5, 9, 10)).toEqual({ ini: 5, fim: 10 });
    expect(zoom({ ini: 2, fim: 4 }, 4, 3, 5)).toEqual({ ini: 0, fim: 5 });
  });

  it("texto em segundos com vírgula", () => {
    expect(segTexto(1.256)).toBe("1,26");
    expect(textoSeg("0,5")).toBe(0.5);
    expect(textoSeg("abc")).toBe(null);
  });
});
