import { describe, expect, it } from "vitest";

import type { AnaliseAcustica, Avaliacao } from "@/lib/voz-clinica-api";
import { acusticasEmOrdem, compararAcusticas, resumoComparacao } from "@/lib/voz-clinica-comparacao";

function analise(over: { jitter?: number | null; shimmer?: number; hnr?: number; cpps?: number | null; f0?: number; gne?: number; tmf?: number }): AnaliseAcustica {
  return {
    motor: "praat",
    duracao_s: 4,
    f0: { media_hz: over.f0 ?? 200, mediana_hz: 200, dp_hz: 2, min_hz: 190, max_hz: 210, dp_semitons: 0.3, faixa_semitons: 1 },
    perturbacao: { jitter_local_pct: over.jitter === undefined ? 1 : over.jitter, shimmer_local_pct: over.shimmer ?? 5 },
    ruido: { hnr_db: over.hnr ?? 15 },
    cpps_db: over.cpps === undefined ? 8 : over.cpps,
    excitacao: { gne: over.gne ?? 0.8, mwc: 0.9 },
    fonacao: { tmf_s: over.tmf ?? 4, fracao_surdos_pct: 0, quebras_de_voz: 0 },
    avisos: [],
  };
}

const linha = (linhas: ReturnType<typeof compararAcusticas>, medida: string) => linhas.find((l) => l.medida === medida)!;

describe("compararAcusticas", () => {
  it("sabe o sentido de cada medida: jitter cai = melhora, HNR cai = piora", () => {
    const l = compararAcusticas(analise({ jitter: 1.8, hnr: 18 }), analise({ jitter: 0.9, hnr: 12 }));
    expect(linha(l, "Jitter local")).toEqual({ medida: "Jitter local", antes: "1,80 %", depois: "0,90 %", diferenca: "−0,90 %", mudanca: "melhorou" });
    expect(linha(l, "HNR")).toMatchObject({ diferenca: "−6,0 dB", mudanca: "piorou" });
  });

  it("variação pequena (dentro da tolerância) não é chamada de melhora", () => {
    const l = compararAcusticas(analise({ cpps: 8 }), analise({ cpps: 8.6 }));
    expect(linha(l, "CPPS")).toMatchObject({ diferenca: "+0,6 dB", mudanca: "sem mudança" });
    expect(linha(l, "Shimmer local")).toMatchObject({ diferenca: "0,00 %", mudanca: "sem mudança" });
  });

  it("F0 muda sem juízo de melhor/pior", () => {
    const l = compararAcusticas(analise({ f0: 200 }), analise({ f0: 230 }));
    expect(linha(l, "F0 média")).toMatchObject({ diferenca: "+30,0 Hz", mudanca: "mudou" });
  });

  it("medida ausente em uma das sessões fica sem dado", () => {
    const l = compararAcusticas(analise({ cpps: null }), analise({}));
    expect(linha(l, "CPPS")).toEqual({ medida: "CPPS", antes: "—", depois: "8,0 dB", diferenca: "—", mudanca: "sem dado" });
  });

  it("resume a contagem", () => {
    const l = compararAcusticas(analise({ jitter: 1.8, gne: 0.6, tmf: 3 }), analise({ jitter: 0.9, gne: 0.85, tmf: 8, hnr: 10 }));
    expect(resumoComparacao(l)).toBe("3 medidas melhoraram, 1 piorou, 6 sem mudança relevante");
  });
});

describe("acusticasEmOrdem", () => {
  it("só análises acústicas válidas, da mais antiga para a mais recente", () => {
    const av = (id: string, dia: number, tipo: Avaliacao["tipo"] = "acustica", r: unknown = analise({})): Avaliacao => ({
      id, paciente: "Ana", tipo, motor: null, resultado: r as AnaliseAcustica, criado_em: `2026-10-${dia}T10:00:00Z`,
    });
    const itens = [av("c", 28), av("x", 27, "idv10"), av("a", 10), av("sem-f0", 12, "acustica", { motor: "interno", duracao_s: 1, avisos: [] })];
    expect(acusticasEmOrdem(itens).map((a) => a.id)).toEqual(["a", "c"]);
  });
});
