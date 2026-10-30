import { describe, expect, it } from "vitest";

import type { AnaliseAcustica, Avaliacao } from "@/lib/voz-clinica-api";
import { historicoCsv } from "@/lib/voz-clinica-planilha";

const acustica: AnaliseAcustica = {
  motor: "praat", duracao_s: 3, avisos: [],
  f0: { media_hz: 210.04, mediana_hz: 210, dp_hz: 1, min_hz: 200, max_hz: 220, dp_semitons: 0.123, faixa_semitons: 1 },
  perturbacao: { jitter_local_pct: 0.4123, shimmer_local_pct: 2.5 }, ruido: { hnr_db: 21.456 }, cpps_db: 13.3,
  excitacao: { gne: 0.95, mwc: 0.98 }, fonacao: { tmf_s: 12.34, fracao_surdos_pct: 0, quebras_de_voz: 0 },
};

describe("historicoCsv", () => {
  it("cabeçalho, vírgula decimal, ordem cronológica e texto protegido", () => {
    const itens: Avaliacao[] = [
      { id: "2", paciente: "Ana", tipo: "dsi", motor: null, criado_em: "2026-10-29T13:00:00Z",
        resultado: { dsi: 3.456, entradas: { tmf_s: 1, f0_alta_hz: 1, i_baixa_db_spl: 1, jitter_pct: 1 }, escala: "", referencia: "" },
        anotacao: '=SOMA(A1); "teste"' },
      { id: "1", paciente: "Ana", tipo: "acustica", motor: "praat", criado_em: "2026-10-28T13:00:00Z", resultado: acustica },
    ];
    const csv = historicoCsv(itens);
    expect(csv.startsWith("\uFEFFdata;tipo;resumo;f0_media_hz")).toBe(true);
    const linhas = csv.trim().split("\r\n");
    expect(linhas.length).toBe(3);
    const ac = linhas[1]!.split(";");
    expect(ac[1]).toBe("Análise acústica");
    expect(ac.slice(3, 12)).toEqual(["210", "0,12", "0,412", "2,5", "21,46", "13,3", "0,95", "0,98", "12,3"]);
    expect(linhas[2]!.endsWith(`;3,46;"'=SOMA(A1); ""teste"""`)).toBe(true);
  });

  it("número negativo continua número; texto com tab vira texto", () => {
    const itens: Avaliacao[] = [
      { id: "3", paciente: "Ana", tipo: "cepstral", motor: "praat", criado_em: "2026-10-29T13:00:00Z",
        resultado: { vogal: { cpps_db: 10 }, frase: { cpps_db: 8 }, avqi: { valor: -1.234 } } as never,
        anotacao: "\t=1+1" },
    ];
    const cel = historicoCsv(itens).trim().split("\r\n")[1]!.split(";");
    expect(cel[14]).toBe("-1,23");
    expect(cel[16]).toBe("'\t=1+1");
  });
});
