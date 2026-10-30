import { describe, expect, it } from "vitest";

import type { AnaliseAcustica, Avaliacao } from "@/lib/voz-clinica-api";
import { montarRelatorioClinico, svgEvolucao } from "@/lib/voz-clinica-relatorio";
import { seriesEvolucao } from "@/lib/voz-clinica-evolucao";

function acustica(dia: number, jitter: number, avisos: string[] = []): Avaliacao {
  const r: AnaliseAcustica = {
    motor: "praat",
    versao_praat: "6.4.27",
    duracao_s: 4.2,
    f0: { media_hz: 205.4, mediana_hz: 205, dp_hz: 2, min_hz: 200, max_hz: 210, dp_semitons: 0.2, faixa_semitons: 0.8 },
    perturbacao: { jitter_local_pct: jitter, shimmer_local_pct: 4.1, jitter_rap_pct: 0.5, jitter_ppq5_pct: 0.6, ciclos: 812 },
    ruido: { hnr_db: 18.2 },
    cpps_db: 11.4,
    formantes: { f1_hz: 780, f2_hz: 1250, f3_hz: 2600 },
    fonacao: { tmf_s: 3.9, fracao_surdos_pct: 0, quebras_de_voz: 0 },
    avisos,
  };
  return { id: `a${dia}`, paciente: "Ana", tipo: "acustica", motor: "praat", resultado: r,
           criado_em: `2026-10-${String(dia).padStart(2, "0")}T14:00:00Z` };
}

const idv = (dia: number, total: number): Avaliacao => ({
  id: `i${dia}`, paciente: "Ana", tipo: "idv10", motor: null, criado_em: `2026-10-${String(dia).padStart(2, "0")}T14:00:00Z`,
  resultado: { protocolo: "IDV-10", total, maximo: 40, acima_do_corte: total > 7.5, corte: 7.5 },
});

const ease = (dia: number, total: number): Avaliacao => ({
  id: `e${dia}`, paciente: "Ana", tipo: "easebr", motor: null, criado_em: `2026-10-${String(dia).padStart(2, "0")}T15:00:00Z`,
  resultado: { protocolo: "EASE-BR", total, maximo: 66, itens_positivos: [6, 12, 21], itens_com_queixa: [2, 9] },
});

const anamnese = (dia: number, resultado: Avaliacao["resultado"]): Avaliacao => ({
  id: `n${dia}`, paciente: "Ana", tipo: "anamnese", motor: null, criado_em: `2026-10-${String(dia).padStart(2, "0")}T09:00:00Z`, resultado,
});

describe("montarRelatorioClinico", () => {
  it("traz paciente, profissional, período e a análise mais recente", () => {
    const html = montarRelatorioClinico("Ana Souza", [acustica(3, 1.8), acustica(20, 0.92), idv(20, 12)], {
      profissional: "Dra. Lívia",
      geradoEm: new Date("2026-10-29T13:00:00Z"),
    });
    expect(html).toContain("<strong>Paciente:</strong> Ana Souza");
    expect(html).toContain("<strong>Profissional:</strong> Dra. Lívia");
    expect(html).toContain("03/10/2026 a 20/10/2026");
    expect(html).toContain("<strong>Avaliações:</strong> 3");
    expect(html).toContain("0,92 %"); // jitter da sessão mais recente
    expect(html).toContain("Praat 6.4.27");
    expect(html).toContain("Acima da nota de corte (7,5)");
    expect(html).toContain("Evolução"); // jitter tem 2 sessões
  });

  it("mostra idade/sexo/profissão do cadastro só quando há", () => {
    expect(montarRelatorioClinico("Ana", [idv(1, 3)], { dadosPaciente: "34 anos · feminino" })).toContain("<strong>Dados:</strong> 34 anos · feminino");
    expect(montarRelatorioClinico("Ana", [idv(1, 3)]).includes("<strong>Dados:</strong>")).toBe(false);
  });

  it("escapa texto digitado pelo usuário", () => {
    const html = montarRelatorioClinico("<script>x</script>", [idv(1, 3)], { observacoes: "a < b & c" });
    expect(html.includes("<script>x</script>")).toBe(false);
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("a &lt; b &amp; c");
  });

  it("omite seções vazias", () => {
    const html = montarRelatorioClinico("Ana", [idv(1, 3)]);
    expect(html.includes("Análise acústica —")).toBe(false);
    expect(html.includes("<h2>Evolução</h2>")).toBe(false); // só 1 IDV-10
    expect(html.includes("Profissional")).toBe(false);
    expect(html.includes("Observações do profissional")).toBe(false);
    expect(html).toContain("Sessões registradas");
  });

  it("medidas complementares só aparecem quando foram calculadas", () => {
    const html = montarRelatorioClinico("Ana", [acustica(1, 1)]);
    expect(html).toContain("Jitter RAP / PPQ5"); // a amostra tem RAP e PPQ5
    expect(html).toContain("0,50 / 0,60 %");
    expect(html.includes("Shimmer APQ3")).toBe(false); // e não tem APQ
    expect(html.includes("— / —")).toBe(false);
  });

  it("leva os avisos da gravação", () => {
    const html = montarRelatorioClinico("Ana", [acustica(1, 1, ["A gravação saturou (clipping)"])]);
    expect(html).toContain("A gravação saturou (clipping)");
  });

  it("recusa paciente sem avaliações", () => {
    expect(() => montarRelatorioClinico("Ana", [])).toThrow(Error);
  });
});

describe("EASE-BR e anamnese no relatório", () => {
  it("EASE-BR vira um cartão sem nota de corte", () => {
    const html = montarRelatorioClinico("Ana", [ease(3, 14)]);
    expect(html).toContain("EASE-BR · ");
    expect(html).toContain("Itens com 2 ou 3 pontos: 2, 9.");
    expect(html).toContain("Sem nota de corte publicada");
  });
  it("leva só a anamnese mais recente, escapada, e só os campos preenchidos", () => {
    const html = montarRelatorioClinico("Ana", [
      anamnese(1, { queixa: "antiga" }),
      anamnese(9, { queixa: "Rouca <à tarde>", refluxo: false }),
    ]);
    const secao = html.slice(html.indexOf("<h2>Anamnese — "), html.indexOf("</section>", html.indexOf("<h2>Anamnese — ")));
    expect(secao).toContain("Rouca &lt;à tarde&gt;");
    expect(secao).toContain("<th>Refluxo ou azia frequente</th><td>Não</td>");
    expect(secao.includes("antiga")).toBe(false); // a antiga só aparece na tabela de sessões
    expect(html).toContain("antiga");
    expect(secao.includes("Medicamentos em uso")).toBe(false);
  });
  it("sem anamnese, sem a seção", () => {
    expect(montarRelatorioClinico("Ana", [ease(3, 14)]).includes("<h2>Anamnese")).toBe(false);
  });
});

describe("svgEvolucao", () => {
  it("tem descrição acessível com os valores", () => {
    const s = seriesEvolucao([acustica(3, 1.8), acustica(20, 0.92)]).find((x) => x.chave === "jitter")!;
    const svg = svgEvolucao(s);
    expect(svg).toContain('role="img"');
    expect(svg).toContain("Jitter local: 03/10 1,80, 20/10 0,92");
    expect(svg).toContain("<polyline");
  });
});
