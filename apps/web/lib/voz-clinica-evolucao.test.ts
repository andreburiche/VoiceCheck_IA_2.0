import { describe, expect, it } from "vitest";

import type { AnaliseAcustica, Avaliacao } from "@/lib/voz-clinica-api";
import { MAX_PONTOS, dataCurta, escalaY, seriesEvolucao, variacaoTexto } from "@/lib/voz-clinica-evolucao";

function acustica(dia: number, jitter: number | null, cpps: number | null): Avaliacao {
  const r: AnaliseAcustica = {
    motor: "interno",
    duracao_s: 3,
    f0: { media_hz: 200, mediana_hz: 200, dp_hz: 1, min_hz: 198, max_hz: 202, dp_semitons: 0.1, faixa_semitons: 0.2 },
    perturbacao: jitter == null ? {} : { jitter_local_pct: jitter, shimmer_local_pct: 4 },
    ruido: { hnr_db: 20 },
    cpps_db: cpps,
    avisos: [],
  };
  return { id: `a${dia}`, paciente: "Ana", tipo: "acustica", motor: "interno", resultado: r,
           criado_em: `2026-10-${String(dia).padStart(2, "0")}T12:00:00Z` };
}

function idv(dia: number, total: number): Avaliacao {
  return { id: `i${dia}`, paciente: "Ana", tipo: "idv10", motor: null,
           resultado: { protocolo: "IDV-10", total, maximo: 40, acima_do_corte: total > 7.5, corte: 7.5 },
           criado_em: `2026-10-${String(dia).padStart(2, "0")}T12:00:00Z` };
}

describe("seriesEvolucao", () => {
  it("monta uma série por medida, em ordem cronológica, só com 2+ pontos", () => {
    const series = seriesEvolucao([acustica(20, 1.2, 10), idv(5, 18), acustica(3, 1.8, 8)]);
    const chaves = series.map((s) => s.chave);
    expect(chaves).toEqual(["jitter", "shimmer", "hnr", "cpps"]); // IDV-10 tem só 1 ponto
    const jitter = series.find((s) => s.chave === "jitter")!;
    expect(jitter.pontos.map((p) => p.valor)).toEqual([1.8, 1.2]);
  });

  it("ignora medições que não puderam ser calculadas", () => {
    const series = seriesEvolucao([acustica(1, 1.5, null), acustica(2, null, 9), acustica(3, 1.1, 11)]);
    expect(series.find((s) => s.chave === "jitter")!.pontos).toHaveLength(2);
    expect(series.find((s) => s.chave === "cpps")!.pontos).toHaveLength(2);
  });

  it("guarda só as sessões mais recentes", () => {
    const muitas = Array.from({ length: MAX_PONTOS + 5 }, (_, i) => idv(i + 1, i));
    const s = seriesEvolucao(muitas)[0]!;
    expect(s.pontos).toHaveLength(MAX_PONTOS);
    expect(s.pontos[0]!.valor).toBe(5);
  });
});

describe("GNE e MWC na evolução", () => {
  it("viram séries de 0 a 1 quando as análises trazem o bloco excitacao", () => {
    const a1 = acustica(3, 1.2, 10); const a2 = acustica(9, 1.0, 11);
    (a1.resultado as { excitacao?: object }).excitacao = { gne: 0.81, mwc: 0.9 };
    (a2.resultado as { excitacao?: object }).excitacao = { gne: 0.93, mwc: 0.95 };
    const series = seriesEvolucao([a2, a1]);
    const gne = series.find((s) => s.chave === "gne")!;
    expect(gne.dominio).toEqual([0, 1]);
    expect(gne.pontos.map((p) => p.valor)).toEqual([0.81, 0.93]);
    expect(series.some((s) => s.chave === "mwc")).toBe(true);
  });
});

describe("EASE-BR na evolução", () => {
  it("vira uma série própria de 0 a 66, sem linha de corte", () => {
    const e = (dia: number, total: number): Avaliacao => ({
      id: `e${dia}`, paciente: "Ana", tipo: "easebr", motor: null, criado_em: `2026-10-${String(dia).padStart(2, "0")}T12:00:00Z`,
      resultado: { protocolo: "EASE-BR", total, maximo: 66, itens_positivos: [6, 12, 21], itens_com_queixa: [] },
    });
    const [s] = seriesEvolucao([e(9, 12), e(2, 20)]);
    expect(s!.chave).toBe("easebr");
    expect(s!.dominio).toEqual([0, 66]);
    expect(s!.corte).toBe(undefined);
    expect(s!.pontos.map((p) => p.valor)).toEqual([20, 12]);
  });
});

describe("escalaY", () => {
  it("usa o domínio fixo do instrumento", () => {
    const s = seriesEvolucao([idv(1, 20), idv(2, 10)])[0]!;
    expect(escalaY(s)).toEqual({ min: 0, max: 40, marcas: [0, 10, 20, 30, 40] });
  });

  it("gera marcas redondas com decimais para medidas pequenas", () => {
    const s = seriesEvolucao([acustica(1, 1.8, 10), acustica(2, 1.2, 12)]).find((x) => x.chave === "jitter")!;
    expect(escalaY(s)).toEqual({ min: 0, max: 2.5, marcas: [0, 0.5, 1, 1.5, 2, 2.5] });
  });

  it("escores inteiros têm passo inteiro e o teto cobre todos os pontos", () => {
    const g = (dia: number, nota: number): Avaliacao => ({
      id: `g${dia}`, paciente: "Ana", tipo: "grbasi", motor: null, criado_em: `2026-10-0${dia}T12:00:00Z`,
      resultado: { protocolo: "GRBASI", registro: "", parametros: { G: { nome: "grau geral", nota, nivel: "" } } },
    });
    expect(escalaY(seriesEvolucao([g(1, 2), g(2, 1)])[0]!).marcas).toEqual([0, 1, 2, 3]);
    for (const maior of [0.4, 3.3, 17, 46, 120]) {
      const s = seriesEvolucao([acustica(1, maior, 1), acustica(2, maior / 2, 1)]).find((x) => x.chave === "jitter")!;
      const e = escalaY(s);
      expect(e.max >= maior).toBe(true);
      expect(e.marcas.length >= 3 && e.marcas.length <= 7).toBe(true);
    }
  });
});

describe("textos", () => {
  it("variação com sinal, vírgula e unidade", () => {
    const s = seriesEvolucao([acustica(3, 1.8, 10), acustica(20, 1.25, 12)]).find((x) => x.chave === "jitter")!;
    expect(variacaoTexto(s)).toBe("−0,55 % desde 03/10");
    const c = seriesEvolucao([acustica(3, 1.8, 10), acustica(20, 1.25, 12)]).find((x) => x.chave === "cpps")!;
    expect(variacaoTexto(c)).toBe("+2,0 dB desde 03/10");
  });

  it("sem variação", () => {
    const s = seriesEvolucao([idv(1, 12), idv(2, 12)])[0]!;
    expect(variacaoTexto(s)).toBe("sem variação desde 01/10");
  });

  it("data curta", () => {
    expect(dataCurta("2026-10-03T12:00:00Z")).toBe("03/10");
    expect(dataCurta("inválida")).toBe("—");
  });
});

describe("evolução da nasalância e do EGG", () => {
  const nas = (dia: number, tarefa: string, media: number) => ({ id: `n${dia}${tarefa}`, paciente: "Ana", tipo: "nasalancia", motor: null,
    criado_em: `2026-10-${String(dia).padStart(2, "0")}T10:00:00Z`, resultado: { tarefa, media_pct: media } }) as unknown as Avaliacao;
  const egg = (dia: number, limiar: number, cq: number) => ({ id: `e${dia}${limiar}`, paciente: "Ana", tipo: "egg", motor: null,
    criado_em: `2026-10-${String(dia).padStart(2, "0")}T10:00:00Z`, resultado: { limiar_pct: limiar, cq_media_pct: cq } }) as unknown as Avaliacao;

  it("nasalância: uma série por tarefa (oral e nasal não se misturam)", () => {
    const s = seriesEvolucao([nas(1, "oral", 12), nas(8, "oral", 10), nas(1, "nasal", 55), nas(8, "nasal", 50), nas(9, "vogal", 20)]);
    const titulos = s.map((x) => x.titulo);
    expect(titulos).toContain("Nasalância — texto oral");
    expect(titulos).toContain("Nasalância — texto nasal");
    expect(titulos.some((t) => t.includes("vogal"))).toBe(false); // só 1 ponto: sem série
    expect(s.find((x) => x.titulo.includes("nasal"))!.pontos.map((p) => p.valor)).toEqual([55, 50]);
  });

  it("EGG: uma série por nível-critério", () => {
    const s = seriesEvolucao([egg(1, 35, 45), egg(8, 35, 48), egg(9, 25, 52)]);
    expect(s.map((x) => x.titulo)).toEqual(["Quociente de contato (EGG, nível 35%)"]);
  });
});

describe("evolução do fonetograma em dB SPL", () => {
  const campo = (dia: number, spl: { db_min: number; db_max: number } | null) => ({ id: `f${dia}`, paciente: "Ana", tipo: "fonetograma", motor: null,
    criado_em: `2026-10-${String(dia).padStart(2, "0")}T10:00:00Z`,
    resultado: { resumo: { extensao_st: 20, faixa_dinamica_media_db: 20 }, ...(spl ? { resumo_spl: { ...spl, deslocamento_db: 100 } } : {}) } }) as unknown as Avaliacao;

  it("só os fonetogramas calibrados entram nas séries em dB SPL", () => {
    const s = seriesEvolucao([campo(1, { db_min: 58, db_max: 96 }), campo(5, null), campo(9, { db_min: 54.5, db_max: 99 })]);
    const fraca = s.find((x) => x.titulo === "Fonetograma — voz mais fraca (dB SPL)")!;
    expect(fraca.pontos.map((p) => p.valor)).toEqual([58, 54.5]);
    expect(s.find((x) => x.titulo === "Fonetograma — extensão")!.pontos).toHaveLength(3);
  });
});
