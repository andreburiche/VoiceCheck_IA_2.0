import { describe, expect, it } from "vitest";

import {
  linhasAcusticas,
  numeroBR,
  resumoAvaliacao,
  resumoProtocolo,
  type AnaliseAcustica,
  type Avaliacao,
} from "@/lib/voz-clinica-api";

const ANALISE: AnaliseAcustica = {
  motor: "interno",
  duracao_s: 3,
  f0: { media_hz: 179.51, mediana_hz: 180.1, dp_hz: 1.2, min_hz: 175, max_hz: 183, dp_semitons: 0.115, faixa_semitons: 0.7 },
  perturbacao: { jitter_local_pct: 1.153, shimmer_local_pct: 4.237, ciclos: 537 },
  ruido: { hnr_db: 17.4 },
  cpps_db: 12.45,
  formantes: { f1_hz: 734.8, f2_hz: 1237, f3_hz: 2539 },
  fonacao: { tmf_s: 2.96, fracao_surdos_pct: 0, quebras_de_voz: 0 },
  avisos: [],
};

describe("numeroBR", () => {
  it("usa vírgula e trata ausentes", () => {
    expect(numeroBR(1.153, 2)).toBe("1,15");
    expect(numeroBR(null)).toBe("—");
    expect(numeroBR(Number.NaN)).toBe("—");
  });
});

describe("linhasAcusticas", () => {
  it("formata as medidas com unidade", () => {
    const linhas = Object.fromEntries(linhasAcusticas(ANALISE));
    expect(linhas["F0 média"]).toBe("179,5 Hz");
    expect(linhas["Jitter local"]).toBe("1,15 %");
    expect(linhas["CPPS"]).toBe("12,5 dB");
    expect(linhas["F1 / F2"]).toBe("735 / 1.237 Hz");
    expect(linhas["Quebras de voz"]).toBe("0");
  });

  it("mostra traço quando a medida não pôde ser calculada", () => {
    const linhas = Object.fromEntries(linhasAcusticas({ ...ANALISE, perturbacao: {}, cpps_db: null }));
    expect(linhas["Jitter local"]).toBe("—");
    expect(linhas["CPPS"]).toBe("—");
  });

  it("sem voz não gera linhas", () => {
    expect(linhasAcusticas({ motor: "interno", duracao_s: 2, avisos: ["sem voz"] })).toEqual([]);
  });
});

describe("resumos", () => {
  it("IDV-10 e QVV citam a nota de corte", () => {
    expect(
      resumoProtocolo({ protocolo: "IDV-10", total: 10, maximo: 40, acima_do_corte: true, corte: 7.5 }),
    ).toBe("10 de 40 pontos — acima da nota de corte (7,5)");
    expect(
      resumoProtocolo({
        protocolo: "QVV", total: 50, fisico: 50, socioemocional: 50,
        abaixo_do_corte: true, corte_total: 91.25, itens_com_problema: [],
      }),
    ).toContain("abaixo da nota de corte (91,25)");
  });

  it("avaliação acústica salva vira uma linha curta", () => {
    const a: Avaliacao = { id: "1", paciente: "Ana", tipo: "acustica", motor: "interno", resultado: ANALISE, criado_em: "2026-10-29T10:00:00Z" };
    expect(resumoAvaliacao(a)).toBe("F0 179,5 Hz · jitter 1,15% · shimmer 4,24% · CPPS 12,5 dB");
  });
});
