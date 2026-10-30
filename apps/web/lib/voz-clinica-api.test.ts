import { describe, expect, it } from "vitest";

import {
  ROTULO_TIPO,
  linhasAcusticas,
  numeroBR,
  resumoAvaliacao,
  resumoCadastro,
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
    expect(linhas["GNE (pulsos glóticos × ruído)"]).toBe("—"); // análise antiga, sem o bloco
  });

  it("mostra GNE e MWC com duas casas", () => {
    const linhas = Object.fromEntries(linhasAcusticas({ ...ANALISE, excitacao: { gne: 0.9687, mwc: 0.9, gne_janelas: 40 } }));
    expect(linhas["GNE (pulsos glóticos × ruído)"]).toBe("0,97");
    expect(linhas["MWC (semelhança entre ciclos)"]).toBe("0,90");
  });

  it("usa casas decimais fixas (3,90 e não 3,9)", () => {
    const linhas = Object.fromEntries(linhasAcusticas({ ...ANALISE, perturbacao: { jitter_local_pct: 0.86, shimmer_local_pct: 3.9 }, f0: { ...ANALISE.f0!, media_hz: 205 } }));
    expect(linhas["Shimmer local"]).toBe("3,90 %");
    expect(linhas["F0 média"]).toBe("205,0 Hz");
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
    expect(
      resumoProtocolo({
        protocolo: "QVV", total: 65, fisico: 70, socioemocional: 57.5,
        abaixo_do_corte: true, corte_total: 91.25, itens_com_problema: [],
      }),
    ).toContain("Total 65,0 · físico 70,0 · socioemocional 57,5");
  });

  it("avaliação acústica salva vira uma linha curta", () => {
    const a: Avaliacao = { id: "1", paciente: "Ana", tipo: "acustica", motor: "interno", resultado: ANALISE, criado_em: "2026-10-29T10:00:00Z" };
    expect(resumoAvaliacao(a)).toBe("F0 179,5 Hz · jitter 1,15% · shimmer 4,24% · CPPS 12,5 dB");
  });

  it("DSI e F0 da fala viram linhas curtas", () => {
    const dsi: Avaliacao = { id: "2", paciente: "Ana", tipo: "dsi", motor: null, criado_em: "2026-10-29T10:00:00Z",
      resultado: { dsi: 3.41, entradas: { tmf_s: 18.5, f0_alta_hz: 659, i_baixa_db_spl: 52, jitter_pct: 0.42 }, escala: "", referencia: "" } };
    expect(resumoAvaliacao(dsi)).toBe("DSI 3,41 · TMF 18,5 s · F0-alta 659 Hz · I-baixa 52 dB SPL · jitter 0,42%");
    const fala: Avaliacao = { id: "3", paciente: "Ana", tipo: "fala", motor: "praat", criado_em: "2026-10-29T10:00:00Z",
      resultado: { motor: "praat", tarefa: "contagem", duracao_s: 20, avisos: [],
        f0: { media_hz: 205, mediana_hz: 201.6, nota_mediana: "G3", dp_hz: 20, dp_semitons: 1.8, p5_hz: 170, p95_hz: 249, faixa_semitons: 6.58 },
        fala: { tempo_vozeado_s: 12, fracao_vozeada_pct: 60, pausas: 7, intensidade_media_dbfs: -24 } } };
    expect(resumoAvaliacao(fala)).toBe("Contagem: F0 mediana 202 Hz (G3) · faixa 6,6 st · 7 pausas");
    expect(ROTULO_TIPO.fala).toBe("F0 da fala");
  });
});

describe("EASE-BR e anamnese", () => {
  it("EASE-BR mostra o total e os itens com queixa, sem nota de corte", () => {
    const r = (itens: number[]) => ({ protocolo: "EASE-BR" as const, total: 14, maximo: 66, itens_positivos: [6, 12, 21], itens_com_queixa: itens });
    expect(resumoProtocolo(r([1, 4]))).toBe("14 de 66 pontos — 2 itens com 2 ou 3 pontos");
    expect(resumoProtocolo(r([7]))).toBe("14 de 66 pontos — 1 item com 2 ou 3 pontos");
    expect(resumoProtocolo(r([]))).toBe("14 de 66 pontos — nenhum item com 2 ou 3 pontos");
  });
  it("anamnese no histórico", () => {
    const a = { id: "1", paciente: "Ana", tipo: "anamnese" as const, motor: null, criado_em: "2026-10-29T10:00:00Z", resultado: { queixa: "Rouquidão" } };
    expect(resumoAvaliacao(a)).toBe("Rouquidão");
    expect(ROTULO_TIPO.anamnese).toBe("Anamnese");
  });
});


describe("resumoCadastro", () => {
  it("idade, sexo e profissão; vazio sem cadastro", () => {
    const base = { paciente: "Ana", data_nascimento: "1990-01-01", sexo: null, telefone: null, email: null, profissao: null, profissional_da_voz: null, observacoes: null };
    expect(resumoCadastro({ ...base, idade: 34, sexo: "feminino", profissao: "Professora", profissional_da_voz: true })).toBe("34 anos · feminino · Professora (voz profissional)");
    expect(resumoCadastro({ ...base, idade: 1 })).toBe("1 ano");
    expect(resumoCadastro({ ...base, profissional_da_voz: true })).toBe("voz profissional");
    expect(resumoCadastro(null)).toBe("");
  });
});
