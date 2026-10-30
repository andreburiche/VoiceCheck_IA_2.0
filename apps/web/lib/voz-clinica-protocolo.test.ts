import { describe, expect, it } from "vitest";

import type { AnaliseAcustica, AnaliseFala, Avaliacao } from "@/lib/voz-clinica-api";
import { linhasProtocolo, posicaoDsi, sugestoesDsi } from "@/lib/voz-clinica-protocolo";

let n = 0;
function av(tipo: Avaliacao["tipo"], quando: string, resultado: unknown): Avaliacao {
  return { id: `x${++n}`, paciente: "Ana", tipo, motor: null, resultado: resultado as AnaliseAcustica, criado_em: quando };
}
function acustica(quando: string, tmf: number, jitter: number): Avaliacao {
  return av("acustica", quando, {
    motor: "praat", duracao_s: tmf + 1, avisos: [],
    f0: { media_hz: 210, mediana_hz: 210, dp_hz: 1, min_hz: 200, max_hz: 220, dp_semitons: 0.1, faixa_semitons: 0.5 },
    perturbacao: { jitter_local_pct: jitter, shimmer_local_pct: 3.2 }, ruido: { hnr_db: 20 }, cpps_db: 12,
    excitacao: { gne: 0.95, mwc: 0.97 }, fonacao: { tmf_s: tmf, fracao_surdos_pct: 0, quebras_de_voz: 0 },
  });
}
const campo = (quando: string, hz: number, nota: string) =>
  av("fonetograma", quando, { resumo: { nota_grave: "A2", nota_aguda: nota, hz_grave: 110, hz_agudo: hz, extensao_st: 31 } });

describe("sugestoesDsi", () => {
  it("TMF = maior do dia mais recente; jitter = análise mais recente; F0-alta = fonetograma", () => {
    const itens = [
      acustica("2026-10-01T13:00:00Z", 25, 0.9), // dia antigo: TMF maior, mas não conta
      acustica("2026-10-29T13:00:00Z", 14.2, 0.6),
      acustica("2026-10-29T13:05:00Z", 17.84, 0.5),
      acustica("2026-10-29T13:10:00Z", 3.1, 0.42), // a mais recente (vogal confortável)
      campo("2026-10-20T13:00:00Z", 659.3, "E5"),
      campo("2026-09-20T13:00:00Z", 523, "C5"),
    ];
    const s = sugestoesDsi(itens);
    expect(s.tmf_s?.valor).toBe(17.8);
    expect(s.tmf_s?.origem).toContain("3 gravações");
    expect(s.jitter_pct?.valor).toBe(0.42);
    expect(s.f0_alta_hz).toEqual({ valor: 659, origem: "fonetograma de 20/10/2026 (E5)" });
  });

  it("sem histórico não sugere nada", () => {
    expect(sugestoesDsi([])).toEqual({});
  });
});

describe("posicaoDsi", () => {
  it("mapeia -5..+5 em 0..100 e limita fora da escala", () => {
    expect(posicaoDsi(0)).toBe(50);
    expect(posicaoDsi(5)).toBe(100);
    expect(posicaoDsi(-8)).toBe(0);
  });
});

describe("linhasProtocolo", () => {
  it("usa a medida mais recente de cada parte e marca o que falta", () => {
    const fala: AnaliseFala = {
      motor: "praat", tarefa: "leitura", duracao_s: 20, avisos: [],
      f0: { media_hz: 205, mediana_hz: 201.6, nota_mediana: "G3", dp_hz: 20, dp_semitons: 1.8, p5_hz: 170.2, p95_hz: 248.9, faixa_semitons: 6.58 },
    };
    const linhas = linhasProtocolo([
      av("fala", "2026-10-29T13:00:00Z", fala),
      acustica("2026-10-28T13:00:00Z", 12, 0.8),
      acustica("2026-10-29T13:00:00Z", 4, 0.5),
      av("dsi", "2026-10-29T14:00:00Z", { dsi: 3.456, entradas: {} }),
    ]);
    const valor = (m: string) => linhas.find((l) => l.medida === m)?.valor;
    expect(valor("F0 habitual (mediana)")).toBe("202 Hz (G3)");
    expect(valor("Variação na fala (p5–p95)")).toBe("170–249 Hz · 6,6 st");
    expect(valor("Jitter / shimmer")).toBe("0,50 % / 3,20 %");
    expect(valor("DSI")).toBe("3,46");
    expect(valor("IDV-10")).toBe("—");
    expect(linhas.find((l) => l.medida === "IDV-10")?.data).toBeNull();
  });
});
