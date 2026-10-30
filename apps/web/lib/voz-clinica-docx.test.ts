import { describe, expect, it } from "vitest";

import type { Avaliacao } from "@/lib/voz-clinica-api";
import { corpoDocx, crc32, montarDocxClinico, nomeArquivoDocx, xml, zipSemCompressao } from "@/lib/voz-clinica-docx";

const ITENS = [
  { id: "1", paciente: "Ana", tipo: "idv10", motor: null, criado_em: "2026-10-20T13:00:00Z",
    resultado: { protocolo: "IDV-10", total: 12, maximo: 40, acima_do_corte: true, corte: 7.5 } },
  { id: "2", paciente: "Ana", tipo: "sessao", motor: null, criado_em: "2026-10-27T13:00:00Z",
    resultado: { numero: 1, data: "2026-10-27", objetivos: "Reduzir <tensão> & ruído", exercicios: "a", exercicios_lista: ["Canudo"], resposta: null, orientacoes: null, observacoes: null } },
] as unknown as Avaliacao[];

describe("relatório em Word (.docx)", () => {
  it("CRC-32 padrão e ZIP com assinaturas e diretório central", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const z = zipSemCompressao([{ nome: "a.txt", dados: new TextEncoder().encode("oi") }]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(1);
  });

  it("escapa texto para XML e tira caracteres de controle", () => {
    expect(xml('a<b>&"c"\u0001')).toBe("a&lt;b&gt;&amp;&quot;c&quot;");
  });

  it("corpo com protocolo, sessão detalhada e tabela de avaliações", () => {
    const c = corpoDocx("Ana", ITENS, { profissional: "Fga. X" });
    expect(c.includes("Reduzir &lt;tensão&gt; &amp; ruído")).toBe(true);
    expect(c.includes("Sessão 1 — 27/10/2026")).toBe(true);
    expect(c.includes("12 de 40 pontos")).toBe(true);
    expect(c.includes("Profissional: ")).toBe(true);
    expect(() => corpoDocx("Ana", [])).toThrow();
  });

  it("pacote com as partes do Word e nome de arquivo sem acento", () => {
    const z = montarDocxClinico("Ana", ITENS);
    const texto = new TextDecoder().decode(z); // sem compressão: os nomes das partes aparecem no binário
    for (const parte of ["[Content_Types].xml", "word/document.xml", "word/styles.xml", "_rels/.rels"]) expect(texto.includes(parte)).toBe(true);
    expect(nomeArquivoDocx("Ana Lúcia", new Date("2026-10-30T12:00:00Z"))).toBe("voicecheck-relatorio-ana-lucia-20261030.docx");
  });
});
