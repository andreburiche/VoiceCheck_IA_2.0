import { describe, expect, it } from "vitest";

import {
  OPCOES_PERCEPTIVA,
  ROTULO_TIPO,
  dataBR,
  resumoMidia,
  tamanhoBR,
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

  it("fonetograma calibrado mostra também os dB SPL", () => {
    const resumo = { nota_grave: "C3", nota_aguda: "B3", hz_grave: 130.8, hz_agudo: 246.9, extensao_st: 11, semitons_alcancados: 12,
      db_min: -40, db_max: -12, faixa_dinamica_media_db: 28, area_st_db: 336 };
    const base = { id: "9", paciente: "Ana", tipo: "fonetograma" as const, motor: null, criado_em: "2026-10-29T10:00:00Z" };
    const semCal: Avaliacao = { ...base, resultado: { duracao_s: 20, pontos: [], resumo, unidade_intensidade: "dBFS", fonte: "navegador" } };
    expect(resumoAvaliacao(semCal)).toBe("C3–B3 (131–247 Hz) · 11 semitons · faixa dinâmica média 28,0 dB");
    const comCal: Avaliacao = { ...base, resultado: { duracao_s: 20, pontos: [], resumo, unidade_intensidade: "dBFS", fonte: "navegador",
      calibracao: { deslocamento_db: 104.8, referencia_db_spl: 75, ponderacao: "C", distancia_cm: 30, microfone: "USB", data: "2026-10-30T12:00:00Z" },
      resumo_spl: { db_min: 64.8, db_max: 92.8, deslocamento_db: 104.8 } } };
    expect(resumoAvaliacao(comCal)).toContain("· 65–93 dB SPL (calibrado, ponderação C)");
  });

  it("carga vocal e biofeedback calibrados mostram dB SPL", () => {
    const base = { id: "c1", paciente: "Ana", motor: null, criado_em: "2026-10-29T10:00:00Z" };
    const carga = { duracao_s: 300, duracao_planejada_s: 300, fonacao_s: 270, alvo_dbfs: { min: -24, max: -16 }, dentro_alvo_pct: 66.7,
      f0_inicio_hz: 201, f0_fim_hz: 224, variacao_f0_st: 1.9, db_inicio: -18.5, db_fim: -23.6, variacao_db: -5.1, minutos: [], fonte: "navegador" as const };
    expect(resumoAvaliacao({ ...base, tipo: "carga", resultado: carga }).includes("SPL")).toBe(false);
    expect(resumoAvaliacao({ ...base, tipo: "carga", resultado: { ...carga, spl: { db_inicio: 81.5, db_fim: 76.4, alvo_min: 76, alvo_max: 84 } } }))
      .toContain("intensidade -5,1 dB · 82 → 76 dB SPL");
    const bio = { duracao_s: 30, fonacao_s: 22.5, alvo_pitch_hz: { min: 180, max: 220 }, alvo_volume_dbfs: { min: -30, max: -12 },
      dentro_pitch_pct: 71.2, dentro_volume_pct: 88, f0_p10_hz: 176, f0_mediana_hz: 201, f0_p90_hz: 228, db_mediano: -21, fonte: "navegador" as const };
    expect(resumoAvaliacao({ ...base, tipo: "biofeedback", resultado: { ...bio, spl: { db_mediano: 79, alvo_min: 70, alvo_max: 88 } } }))
      .toContain("alvo 180–220 Hz · volume 70–88 dB SPL");
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

describe("perceptiva complementar e sessões de terapia (iVox)", () => {
  it("perceptiva: resume só o que está alterado", () => {
    expect(resumoProtocolo({ protocolo: "Perceptiva", parametros: {}, alterados: ["ressonância hipernasal", "loudness reduzida (fraca)"], observacoes: null }))
      .toBe("Alterado: ressonância hipernasal, loudness reduzida (fraca)");
    expect(resumoProtocolo({ protocolo: "Perceptiva", parametros: {}, alterados: [], observacoes: null }))
      .toBe("Ressonância, pitch e loudness adequados");
  });

  it("as opções obrigatórias começam pela adequada (o servidor usa a mesma regra)", () => {
    expect(OPCOES_PERCEPTIVA.filter((p) => p.obrigatorio).map((p) => p.opcoes[0]![0])).toEqual(["equilibrada", "adequado", "adequada"]);
  });

  it("sessão: número, data brasileira, objetivo curto e contagem de exercícios", () => {
    const a = {
      id: "s1", paciente: "Ana", tipo: "sessao", motor: null, criado_em: "2026-10-27T13:00:00Z",
      resultado: { numero: 3, data: "2026-10-27", objetivos: "reduzir a tensão laríngea durante a fala encadeada em sala de aula com muitos alunos",
        exercicios: "a\nb", exercicios_lista: ["a", "b"], resposta: null, orientacoes: null, observacoes: null },
    } as Avaliacao;
    const r = resumoAvaliacao(a);
    expect(r.startsWith("Sessão 3 (27/10/2026) · objetivo: reduzir a tensão")).toBe(true);
    expect(r.endsWith("… · 2 exercícios")).toBe(true);
    expect(ROTULO_TIPO.sessao).toBe("Sessão de terapia");
    expect(dataBR("2026-01-05")).toBe("05/01/2026");
  });
});

describe("mídias do paciente", () => {
  it("resumo com tipo, descrição, nome e tamanho", () => {
    expect(resumoMidia({ categoria: "video", mime: "video/mp4", extensao: "mp4", bytes: 5 * 1024 * 1024, nome_original: "sessao.mp4", descricao: "Sessão 3" }))
      .toBe("Vídeo · Sessão 3 · sessao.mp4 · 5,0 MB");
    expect(resumoMidia({ categoria: "imagem", mime: "image/png", extensao: "png", bytes: 2048, nome_original: null, descricao: null }))
      .toBe("Imagem · 2 KB");
    expect(tamanhoBR(1536 * 1024)).toBe("1,5 MB");
  });
});
