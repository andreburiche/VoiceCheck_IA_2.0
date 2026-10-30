import { describe, expect, it } from "vitest";

import type { AnaliseAcustica, Avaliacao } from "@/lib/voz-clinica-api";
import { pontoDdf, pontosDdf, quadrante, svgDdf } from "@/lib/voz-clinica-ddf";

const ac = (jitter: number, shimmer: number, gne: number, quando: string) =>
  ({ id: quando, paciente: "Ana", tipo: "acustica", motor: "praat", criado_em: quando,
     resultado: { perturbacao: { jitter_local_pct: jitter, shimmer_local_pct: shimmer }, excitacao: { gne } } as unknown as AnaliseAcustica }) as Avaliacao;

describe("diagrama irregularidade × ruído", () => {
  it("eixos valem 1 exatamente nos limites do VoxMetria", () => {
    const p = pontoDdf({ perturbacao: { jitter_local_pct: 0.6, shimmer_local_pct: 6.5 }, excitacao: { gne: 0.5 } } as unknown as AnaliseAcustica)!;
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.y).toBeCloseTo(1, 6);
    expect(p.quadrante).toBe("normal");
  });

  it("jitter acima do limite tira da área normal mesmo com shimmer baixo", () => {
    const p = pontoDdf({ perturbacao: { jitter_local_pct: 0.84, shimmer_local_pct: 1.1 }, excitacao: { gne: 1 } } as unknown as AnaliseAcustica)!;
    expect(p.x).toBeCloseTo(1.4, 6);
    expect(p.quadrante).toBe("irregularidade");
  });

  it("quadrantes como no DDF", () => {
    expect(quadrante(0.5, 0.5)).toBe("normal");
    expect(quadrante(1.5, 0.5)).toBe("irregularidade");
    expect(quadrante(0.5, 1.5)).toBe("ruido");
    expect(quadrante(1.5, 1.5)).toBe("ambos");
  });

  it("só análises acústicas com jitter, shimmer e GNE, em ordem cronológica", () => {
    const itens = [ac(1.2, 9, 0.3, "2026-10-27T10:00:00Z"), ac(0.3, 3, 0.9, "2026-10-20T10:00:00Z"),
      { ...ac(0.3, 3, 0.9, "2026-10-21T10:00:00Z"), resultado: { perturbacao: {} } } as Avaliacao,
      { id: "q", paciente: "Ana", tipo: "idv10", motor: null, criado_em: "2026-10-22T10:00:00Z", resultado: {} } as Avaliacao];
    const p = pontosDdf(itens);
    expect(p.map((x) => x.quadrante)).toEqual(["normal", "ambos"]);
  });

  it("SVG só com números e rótulos fixos; valores extremos presos na borda", () => {
    const svg = svgDdf(pontosDdf([ac(30, 90, 0, "2026-10-20T10:00:00Z")]));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.includes("NaN")).toBe(false);
    expect(svg.includes('cx="310.0"')).toBe(true); // x = 3 (borda direita: 34 + 276)
  });
});
