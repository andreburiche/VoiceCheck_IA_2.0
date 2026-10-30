import { describe, expect, it } from "vitest";

import type { Avaliacao, ResultadoFonetograma } from "@/lib/voz-clinica-api";
import { campoParaRelatorio, compararCampos, fonetogramasEmOrdem, pontosNaUnidade, svgCampos, trechosContiguos } from "@/lib/voz-clinica-comparacao-campo";

const CAL = (desloc: number) => ({ deslocamento_db: desloc, referencia_db_spl: 75, ponderacao: "C" as const, distancia_cm: 30, microfone: "", data: "2026-10-01T12:00:00Z" });

function campo(midis: number[], min: number, max: number, desloc: number | null = null): ResultadoFonetograma {
  return {
    duracao_s: 30,
    pontos: midis.map((midi) => ({ midi, min_db: min, max_db: max, tempo_s: 0.5 })),
    resumo: { nota_grave: null, nota_aguda: null, hz_grave: null, hz_agudo: null, extensao_st: 0, semitons_alcancados: 0, db_min: null, db_max: null, faixa_dinamica_media_db: null, area_st_db: 0 },
    unidade_intensidade: "dBFS",
    fonte: "navegador",
    ...(desloc === null ? {} : { calibracao: CAL(desloc), resumo_spl: { db_min: min + desloc, db_max: max + desloc, deslocamento_db: desloc } }),
  };
}
const faixa = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("comparação de fonetogramas", () => {
  it("extensão, notas ganhas e perdidas, em dBFS sem calibração", () => {
    const antes = campo(faixa(48, 60), -40, -15); // C3–C4
    const depois = campo([...faixa(50, 67)], -45, -12); // D3–G4
    const c = compararCampos(antes, depois);
    expect(c.unidade).toBe("dBFS");
    expect(c.aviso).toMatch(/mesmo microfone/);
    const l = Object.fromEntries(c.linhas.map((x) => [x.medida, x]));
    expect(l["Nota mais grave"]).toMatchObject({ antes: "C3", depois: "D3" });
    expect(l["Extensão"]).toMatchObject({ antes: "12 st", depois: "17 st", diferenca: "+5 st" });
    expect(l["Voz mais fraca"]!.diferenca).toBe("−5,0 dBFS");
    expect(l["Faixa dinâmica média"]!.diferenca).toBe("+8,0 dB");
    expect(c.ganhas).toBe("C#4–G4");
    expect(c.perdidas).toBe("C3–C#3");
    expect([c.nGanhas, c.nPerdidas]).toEqual([7, 2]);
  });

  it("os dois calibrados: cada um convertido com a própria calibração (dB SPL)", () => {
    const antes = campo(faixa(48, 52), -40, -15, 100); // 60–85 dB SPL
    const depois = campo(faixa(48, 52), -38, -20, 95); // 57–75 dB SPL (outro ganho, outra calibração)
    const c = compararCampos(antes, depois);
    expect(c.unidade).toBe("dB SPL");
    expect(c.aviso).toBeNull();
    const l = Object.fromEntries(c.linhas.map((x) => [x.medida, x]));
    expect(l["Voz mais fraca"]).toMatchObject({ antes: "60,0 dB SPL", depois: "57,0 dB SPL", diferenca: "−3,0 dB SPL" });
    expect(l["Voz mais forte"]!.depois).toBe("75,0 dB SPL");
  });

  it("só um calibrado: volta a dBFS e avisa", () => {
    const c = compararCampos(campo([60], -40, -20, 100), campo([60], -40, -20));
    expect(c.unidade).toBe("dBFS");
    expect(c.aviso).toMatch(/Só um/);
    expect(pontosNaUnidade(campo([60], -40, -20, 100), "dBFS")[0]).toEqual({ midi: 60, min_db: -40, max_db: -20 });
  });

  it("trechos contíguos e ordem dos fonetogramas", () => {
    const p = pontosNaUnidade(campo([48, 49, 50, 55, 56], -40, -20), "dBFS");
    expect(trechosContiguos(p).map((t) => t.map((x) => x.midi))).toEqual([[48, 49, 50], [55, 56]]);
    const av = (id: string, quando: string, r: unknown) => ({ id, paciente: "Ana", tipo: "fonetograma", motor: null, criado_em: quando, resultado: r }) as Avaliacao;
    const lista = fonetogramasEmOrdem([av("b", "2026-10-20T10:00:00Z", campo([60], -40, -20)), av("vazio", "2026-10-01T10:00:00Z", campo([], 0, 0)),
      av("a", "2026-10-10T10:00:00Z", campo([60], -40, -20))]);
    expect(lista.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("SVG do relatório: um polígono por trecho; nada com campo vazio", () => {
    const p = pontosNaUnidade(campo([48, 49, 55], -40, -20), "dBFS");
    const svg = svgCampos(p, null, "dBFS");
    expect((svg.match(/<path /g) ?? []).length).toBe(1);
    expect((svg.match(/Z/g) ?? []).length).toBe(2);
    expect(svg.includes("NaN")).toBe(false);
    expect(svgCampos([], null, "dBFS")).toBe("");
    const av = (id: string, quando: string, r: unknown) => ({ id, paciente: "Ana", tipo: "fonetograma", motor: null, criado_em: quando, resultado: r }) as Avaliacao;
    expect(campoParaRelatorio([])).toBeNull();
    const rel = campoParaRelatorio([av("b", "2026-10-20T10:00:00Z", campo([60, 61], -40, -20, 100)), av("a", "2026-10-10T10:00:00Z", campo([60], -40, -20, 100))])!;
    expect([rel.primeiro?.id, rel.ultimo.id, rel.unidade]).toEqual(["a", "b", "dB SPL"]);
  });
});
