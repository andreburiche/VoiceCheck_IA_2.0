import { describe, expect, it } from "vitest";

import type { Avaliacao, CadastroPaciente } from "@/lib/voz-clinica-api";
import { MODELOS, achados, anonimizar, corpoHtml, formatarLinha, gerarRascunho, htmlDocumento, pendencias, type Contexto } from "@/lib/voz-clinica-documentos";

const av = (tipo: Avaliacao["tipo"], resultado: unknown, criado_em: string): Avaliacao =>
  ({ id: `${tipo}-${criado_em}`, paciente: "Ana Souza", tipo, motor: null, criado_em, resultado }) as Avaliacao;

const CADASTRO = {
  paciente: "Ana Souza", data_nascimento: "1990-05-02", idade: 36, sexo: "feminino", telefone: null, email: null,
  profissao: "professora", profissional_da_voz: true, observacoes: null,
} as CadastroPaciente;

const ITENS: Avaliacao[] = [
  av("acustica", { perturbacao: { jitter_local_pct: 0.3, shimmer_local_pct: 3 }, excitacao: { gne: 0.9 }, f0: { media_hz: 210 }, cpps_db: 12 }, "2026-10-01T10:00:00Z"),
  av("acustica", { perturbacao: { jitter_local_pct: 1.2, shimmer_local_pct: 4 }, excitacao: { gne: 0.9 }, f0: { media_hz: 205 }, cpps_db: 9 }, "2026-10-20T10:00:00Z"),
  av("idv10", { protocolo: "IDV-10", total: 18, maximo: 40, acima_do_corte: true, corte: 7.5 }, "2026-10-20T10:05:00Z"),
  av("anamnese", { queixa: "rouquidão ao fim do dia" }, "2026-10-20T09:00:00Z"),
  av("sessao", { numero: 1, data: "2026-10-21", exercicios_lista: ["Sopro com canudo", "Vibração de língua"] }, "2026-10-21T10:00:00Z"),
];

const ctx = (extras: Contexto["extras"] = {}): Contexto => ({
  paciente: "Ana Souza", cadastro: CADASTRO, itens: ITENS, hoje: new Date("2026-10-30T12:00:00Z"), extras,
});

describe("documentos para o paciente", () => {
  it("todos os modelos geram título e texto sem 'undefined' nem 'NaN'", () => {
    for (const m of MODELOS) {
      const d = gerarRascunho(m.id, ctx());
      expect(d.titulo.length > 0).toBe(true);
      expect(/undefined|NaN|null/.test(d.corpo)).toBe(false);
    }
  });

  it("achados usam só o registro mais recente de cada tipo", () => {
    const a = achados(ITENS);
    expect(a.filter((l) => l.includes("Análise acústica")).length).toBe(1);
    expect(a[0]!.includes("20/10/2026")).toBe(true);
    expect(a[0]!.includes("1,20%")).toBe(true);
    expect(a.some((l) => l.startsWith("• IDV-10"))).toBe(true);
  });

  it("encaminhamento ao otorrino traz identificação, queixa da anamnese e achados", () => {
    const d = gerarRascunho("encaminhamento_orl", ctx());
    expect(d.corpo.includes("Ana Souza, 36 anos, professora")).toBe(true);
    expect(d.corpo.includes("queixa de rouquidão ao fim do dia")).toBe(true);
    expect(d.corpo.includes("videolaringoscopia")).toBe(true);
  });

  it("devolutiva fala em linguagem simples a partir das medidas", () => {
    const d = gerarRascunho("devolutiva", ctx());
    expect(d.corpo.startsWith("Olá, Ana.")).toBe(true);
    expect(d.corpo.includes("mais irregular do que o esperado")).toBe(true); // jitter 1,2% > 0,6%
    expect(d.corpo.includes("está atrapalhando o seu dia a dia")).toBe(true);
  });

  it("declaração e atestado usam data, horário e dias informados", () => {
    expect(gerarRascunho("comparecimento", ctx({ inicio: "2026-10-29", horaInicio: "14:00", horaFim: "14:50" })).corpo)
      .toBe("Declaro, para os devidos fins, que Ana Souza compareceu a atendimento fonoaudiológico no dia 29/10/2026, das 14:00 às 14:50.");
    const at = gerarRascunho("atestado", ctx({ dias: 3, inicio: "2026-10-30" })).corpo;
    expect(at.includes("por 3 (três) dias, a partir de 30/10/2026")).toBe(true);
  });

  it("plano terapêutico aproveita os exercícios da última sessão", () => {
    expect(gerarRascunho("plano", ctx()).corpo.includes("• Sopro com canudo\n• Vibração de língua")).toBe(true);
  });

  it("sem dados no prontuário, deixa colchetes para completar e avisa", () => {
    const d = gerarRascunho("relatorio", { paciente: "Bia", cadastro: null, itens: [], hoje: new Date() });
    const p = pendencias(d.corpo);
    expect(p.includes("[queixa vocal]")).toBe(true);
    expect(p.includes("[conclusão fonoaudiológica]")).toBe(true);
    expect(pendencias("Texto completo, sem pendências.")).toEqual([]);
  });

  it("impressão escapa o texto e monta listas e assinaturas", () => {
    const html = htmlDocumento({
      modelo: "consentimento", titulo: "Termo <x>", corpo: "Parágrafo com <script>alert(1)</script>.\n\nItens:\n• um\n• dois\n\n1. a\n2. b",
      profissional: { nome: "Ana Fono", registro: "CRFa 2-12345", contato: null, cidade: "Recife" }, emitido_em: "2026-10-30T15:00:00Z",
    }, "Bia & Cia", "https://exemplo.test/brand/voicecheck-lockup-v3-papel.png");
    expect(html.includes("<script>alert")).toBe(false);
    expect(html.includes("&lt;script&gt;")).toBe(true);
    expect(html.includes("<p>Itens:</p><ul><li>um</li><li>dois</li></ul>")).toBe(true);
    expect(html.includes("<ol><li>a</li><li>b</li></ol>")).toBe(true);
    expect(html.includes("Bia &amp; Cia")).toBe(true); // consentimento: assinatura do paciente também
    expect(html.includes("Recife, 30 de outubro de 2026.")).toBe(true);
    expect(html.includes("CRFa 2-12345")).toBe(true);
    expect(html.includes('<img src="https://exemplo.test/brand/voicecheck-lockup-v3-papel.png" alt="VoiceCheck IA" />')).toBe(true);
  });

  it("marcação da barra de ferramentas: negrito, itálico, subtítulo e listas, sem abrir brecha para HTML", () => {
    expect(formatarLinha("voz **rouca** e _soprosa_.")).toBe("voz <strong>rouca</strong> e <em>soprosa</em>.");
    expect(formatarLinha("**<b>x</b>**")).toBe("<strong>&lt;b&gt;x&lt;/b&gt;</strong>");
    expect(formatarLinha("arquivo_de_audio e 2 * 3 ** 4")).toBe("arquivo_de_audio e 2 * 3 ** 4");
    const html = corpoHtml("## Conduta\nTexto antes\n• um\n• dois\nTexto depois\n\n1. a\n2. **b**");
    expect(html).toBe("<h2>Conduta</h2><p>Texto antes</p><ul><li>um</li><li>dois</li></ul><p>Texto depois</p>\n<ol><li>a</li><li><strong>b</strong></li></ol>");
  });

  it("anonimiza o nome antes da IA e devolve na volta", () => {
    const a = anonimizar("Olá, Ana. Ana  Souza fez a avaliação; Anabela não é a paciente.", "Ana Souza");
    expect(a.texto).toBe("Olá, [PRIMEIRO_NOME]. [PACIENTE] fez a avaliação; Anabela não é a paciente.");
    expect(a.restaurar("Olá, [PRIMEIRO_NOME]! [PACIENTE] melhorou.")).toBe("Olá, Ana! Ana Souza melhorou.");
    expect(anonimizar("Texto de João.", "João").texto).toBe("Texto de [PACIENTE].");
  });
});
