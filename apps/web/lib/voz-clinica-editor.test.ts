import { describe, expect, it } from "vitest";

import { apagarTrecho, colarTrecho, colunasMinMax, copiarTrecho, normalizarSelecao, segTexto, textoSeg, zoom } from "@/lib/voz-clinica-editor";

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

describe("copiar e colar", () => {
  const taxa = 1000; // 5 ms = 5 amostras
  const x = Float32Array.from({ length: 1000 }, (_, i) => (i < 500 ? 0.5 : -0.5)); // 1 s

  it("copia a seleção", () => {
    const c = copiarTrecho(x, taxa, { ini: 0.1, fim: 0.3 });
    expect(c.length).toBe(200);
    expect(c[0]).toBe(0.5);
    c[0] = 9; // é cópia: o original não muda
    expect(x[100]).toBe(0.5);
  });

  it("cola no ponto: duração soma e o trecho fica no lugar, com emendas suaves", () => {
    const trecho = new Float32Array(100).fill(0.25);
    const y = colarTrecho(x, taxa, trecho, 0.5);
    expect(y.length).toBe(1100);
    expect(y[550]).toBe(0.25); // meio do trecho colado
    expect(y[500]).toBe(0); // entrada do trecho em zero
    expect(y[499]).toBe(0); // saída da parte anterior em zero
    expect(y[1099]).toBe(-0.5); // fim do original intacto
  });

  it("cola no lugar da seleção (substitui)", () => {
    const trecho = new Float32Array(50).fill(0.1);
    const y = colarTrecho(x, taxa, trecho, { ini: 0.2, fim: 0.4 });
    expect(y.length).toBe(1000 - 200 + 50);
    expect(y[225]).toBeCloseTo(0.1);
  });

  it("colar no início ou no fim não quebra", () => {
    const t2 = new Float32Array(20).fill(0.3);
    expect(colarTrecho(x, taxa, t2, 0).length).toBe(1020);
    expect(colarTrecho(x, taxa, t2, 99).length).toBe(1020);
  });
});
