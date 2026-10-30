/**
 * VoiceCheck IA 2.0 — relatório da avaliação clínica em Word (.docx), como o iVox.
 * Mesmo conteúdo do relatório em PDF (lib/voz-clinica-relatorio.ts), menos os gráficos.
 * O .docx é um ZIP com XML (Office Open XML); montado aqui, sem biblioteca, para não
 * pesar o site. Abre no Word, no LibreOffice e no Google Docs.
 */
import {
  ROTULO_TIPO,
  dataBR,
  fixoBR,
  linhasAcusticas,
  resumoAvaliacao,
  resumoProtocolo,
  type AnaliseAcustica,
  type Avaliacao,
  type ResultadoProtocolo,
  type ResultadoSessao,
} from "@/lib/voz-clinica-api";
import { linhasAnamnese, type Anamnese } from "@/lib/voz-clinica-anamnese";
import { notaIntensidade } from "@/lib/voz-clinica-calibracao";
import { campoParaRelatorio } from "@/lib/voz-clinica-comparacao-campo";
import type { OpcoesRelatorio } from "@/lib/voz-clinica-relatorio";

// ---------------------------------------------------------------------------
// ZIP sem compressão (método "stored"): suficiente para o .docx e sem dependência
// ---------------------------------------------------------------------------

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipSemCompressao(arquivos: { nome: string; dados: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 01/01/1980
    local.setUint32(14, crc, true);
    local.setUint32(18, a.dados.length, true);
    local.setUint32(22, a.dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, a.dados);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, a.dados.length, true);
    cd.setUint32(24, a.dados.length, true);
    cd.setUint16(28, nome.length, true);
    cd.setUint32(42, pos, true);
    central.push(new Uint8Array(cd.buffer), nome);
    pos += 30 + nome.length + a.dados.length;
  }
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, pos, true);
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of tudo) { saida.set(p, o); o += p.length; }
  return saida;
}

// ---------------------------------------------------------------------------
// WordprocessingML
// ---------------------------------------------------------------------------

/** Escapa para XML e tira caracteres de controle que o Word recusa. */
export function xml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function corrida(texto: string, negrito = false, cor?: string, tamanho?: number): string {
  const props = [negrito ? "<w:b/>" : "", cor ? `<w:color w:val="${cor}"/>` : "", tamanho ? `<w:sz w:val="${tamanho}"/>` : ""].join("");
  // quebras de linha viram <w:br/> dentro do mesmo parágrafo
  const pedacos = texto.split("\n").map((l) => `<w:t xml:space="preserve">${xml(l)}</w:t>`).join("<w:br/>");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${pedacos}</w:r>`;
}

function par(conteudo: string | { rotulo: string; valor: string }, estilo?: string): string {
  const pPr = estilo ? `<w:pPr><w:pStyle w:val="${estilo}"/></w:pPr>` : "";
  const corpo = typeof conteudo === "string" ? corrida(conteudo) : corrida(`${conteudo.rotulo}: `, true) + corrida(conteudo.valor);
  return `<w:p>${pPr}${corpo}</w:p>`;
}

function tabela(cabecalho: string[] | null, linhas: string[][]): string {
  const celula = (t: string, cab = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${corrida(t, cab, cab ? "4E6170" : undefined, cab ? 18 : undefined)}</w:p></w:tc>`;
  const tr = (cels: string[], cab = false) => `<w:tr>${cels.map((c) => celula(c, cab)).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Tabela"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>${
    cabecalho ? tr(cabecalho, true) : ""}${linhas.map((l) => tr(l)).join("")}</w:tbl><w:p/>`;
}

function dataHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function dataDia(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}
function ultima(itens: Avaliacao[], tipo: Avaliacao["tipo"]): Avaliacao | undefined {
  return itens.filter((a) => a.tipo === tipo).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="14B8A6"/></w:pBdr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:color w:val="0F766E"/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Nota"><w:name w:val="Nota"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="4E6170"/><w:sz w:val="16"/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="Tabela"><w:name w:val="Tabela"/><w:tblPr><w:tblBorders>
    <w:bottom w:val="single" w:sz="4" w:color="D6E1E6"/><w:insideH w:val="single" w:sz="4" w:color="D6E1E6"/></w:tblBorders>
    <w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

const RELS_DOC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/** Corpo do documento (só o XML de <w:body>), separado para teste. */
export function corpoDocx(paciente: string, itens: Avaliacao[], opcoes: OpcoesRelatorio = {}): string {
  const nome = paciente.trim() || "Paciente";
  if (!itens.length) throw new Error("Não há avaliações salvas para este paciente.");
  const ordenadas = [...itens].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const primeira = ordenadas[0]!;
  const ult = ordenadas[ordenadas.length - 1]!;
  const periodo = dataDia(primeira.criado_em) === dataDia(ult.criado_em) ? dataDia(ult.criado_em) : `${dataDia(primeira.criado_em)} a ${dataDia(ult.criado_em)}`;
  const b: string[] = [];
  b.push(par("Relatório de avaliação vocal", "Title"));
  b.push(par("VoiceCheck IA · avaliação clínica da voz", "Nota"));
  b.push(par({ rotulo: "Paciente", valor: nome }));
  if (opcoes.dadosPaciente?.trim()) b.push(par({ rotulo: "Dados", valor: opcoes.dadosPaciente.trim() }));
  if (opcoes.profissional?.trim()) b.push(par({ rotulo: "Profissional", valor: opcoes.profissional.trim() }));
  b.push(par({ rotulo: "Período", valor: periodo }));
  b.push(par({ rotulo: "Avaliações", valor: String(ordenadas.length) }));
  b.push(par({ rotulo: "Gerado em", valor: (opcoes.geradoEm ?? new Date()).toLocaleString("pt-BR") }));

  const anam = ultima(itens, "anamnese");
  const linhasA = anam ? linhasAnamnese(anam.resultado as Anamnese) : [];
  if (linhasA.length) {
    b.push(par(`Anamnese — ${dataDia(anam!.criado_em)}`, "Heading1"));
    b.push(tabela(null, linhasA.map(([k, v]) => [k, v])));
  }

  const ac = ultima(itens, "acustica");
  const linhasAc = ac ? linhasAcusticas(ac.resultado as AnaliseAcustica) : [];
  if (linhasAc.length) {
    const r = ac!.resultado as AnaliseAcustica;
    b.push(par(`Análise acústica — ${dataHora(ac!.criado_em)}`, "Heading1"));
    b.push(tabela(["Medida", "Valor"], linhasAc.map(([m, v]) => [m, v])));
    const motor = r.motor === "praat" ? `Praat ${r.versao_praat ?? ""}`.trim() : "motor interno";
    b.push(par(`Vogal sustentada · ${fixoBR(r.duracao_s, 1)} s gravados · calculado por ${motor}.`, "Nota"));
    for (const aviso of r.avisos ?? []) b.push(par(`• ${aviso}`, "Nota"));
  }

  const protocolos = (["idv10", "qvv", "grbasi", "perceptiva", "easebr"] as const)
    .map((t) => ultima(itens, t))
    .filter((a): a is Avaliacao => Boolean(a));
  if (protocolos.length) {
    b.push(par("Protocolos e avaliação perceptiva", "Heading1"));
    b.push(tabela(["Protocolo", "Data", "Resultado"], protocolos.map((a) => {
      const r = a.resultado as ResultadoProtocolo & { observacoes?: string | null };
      const extra = a.tipo === "perceptiva" && r.observacoes ? ` Observações: ${r.observacoes}` : "";
      return [ROTULO_TIPO[a.tipo], dataDia(a.criado_em), resumoProtocolo(r) + extra];
    })));
  }

  const campo = campoParaRelatorio(itens);
  if (campo) {
    b.push(par("Campo vocal (fonetograma)", "Heading1"));
    if (campo.comparacao && campo.primeiro) {
      const cmp = campo.comparacao;
      b.push(par(`Primeiro (${dataDia(campo.primeiro.criado_em)}) e mais recente (${dataDia(campo.ultimo.criado_em)}); intensidade em ${campo.unidade}.`));
      b.push(tabela(["Medida", dataDia(campo.primeiro.criado_em), dataDia(campo.ultimo.criado_em), "Diferença"], cmp.linhas.map((l) => [l.medida, l.antes, l.depois, l.diferenca])));
      b.push(par(`Notas novas: ${cmp.nGanhas ? cmp.ganhas : "nenhuma"}. Não alcançadas na mais recente: ${cmp.nPerdidas ? cmp.perdidas : "nenhuma"}.`));
      if (cmp.aviso) b.push(par(cmp.aviso, "Nota"));
    } else {
      b.push(par({ rotulo: dataDia(campo.ultimo.criado_em), valor: resumoAvaliacao(campo.ultimo) }));
    }
  }

  const sessoes = ordenadas.filter((a) => a.tipo === "sessao").map((a) => a.resultado as ResultadoSessao);
  if (sessoes.length) {
    b.push(par("Sessões de terapia", "Heading1"));
    for (const s of sessoes) {
      b.push(par(`Sessão ${s.numero} — ${dataBR(s.data)}`, "Heading2"));
      if (s.objetivos) b.push(par({ rotulo: "Objetivos", valor: s.objetivos }));
      if (s.exercicios_lista?.length) {
        b.push(par({ rotulo: "Exercícios", valor: "" }));
        for (const x of s.exercicios_lista) b.push(par(`• ${x}`));
      }
      if (s.resposta) b.push(par({ rotulo: "Resposta do paciente", valor: s.resposta }));
      if (s.orientacoes) b.push(par({ rotulo: "Orientações", valor: s.orientacoes }));
      if (s.observacoes) b.push(par({ rotulo: "Observações", valor: s.observacoes }));
    }
  }

  b.push(par("Avaliações registradas", "Heading1"));
  b.push(tabela(["Data", "Avaliação", "Resultado"], ordenadas.map((a) => {
    let resumo: string;
    if (a.tipo === "acustica") {
      const r = a.resultado as AnaliseAcustica;
      const p = r.perturbacao ?? {};
      resumo = `F0 ${fixoBR(r.f0?.media_hz, 1)} Hz · jitter ${fixoBR(p.jitter_local_pct, 2)} % · shimmer ${fixoBR(p.shimmer_local_pct, 2)} % · HNR ${fixoBR(r.ruido?.hnr_db, 1)} dB · CPPS ${fixoBR(r.cpps_db, 1)} dB`;
    } else {
      resumo = resumoAvaliacao(a);
    }
    if (a.anotacao) resumo += `\nAnotação: ${a.anotacao}`;
    return [dataHora(a.criado_em), ROTULO_TIPO[a.tipo] ?? a.tipo, resumo];
  })));

  const obs = opcoes.observacoes?.trim();
  if (obs) {
    b.push(par("Observações do profissional", "Heading1"));
    b.push(par(obs));
  }
  b.push(par("Os gráficos de evolução e do campo vocal estão no relatório em PDF.", "Nota"));
  b.push(par(notaIntensidade(itens.map((a) => a.resultado)), "Nota"));
  b.push(par("Notas de corte: IDV-10 7,5 e QVV 91,25 (Behlau et al., 2016). EASE-BR: total de 0 a 66 (Rocha et al., 2014), sem nota de corte publicada.", "Nota"));
  b.push(par("Este relatório apoia a avaliação do profissional e não é um diagnóstico médico.", "Nota"));
  return b.join("");
}

export function montarDocxClinico(paciente: string, itens: Avaliacao[], opcoes: OpcoesRelatorio = {}): Uint8Array<ArrayBuffer> {
  const corpo = corpoDocx(paciente, itens, opcoes);
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="900" w:bottom="1000" w:left="900" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const agora = (opcoes.geradoEm ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Relatório de avaliação vocal</dc:title><dc:creator>VoiceCheck IA</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${agora}</dcterms:created></cp:coreProperties>`;
  const enc = new TextEncoder();
  return zipSemCompressao([
    { nome: "[Content_Types].xml", dados: enc.encode(TIPOS) },
    { nome: "_rels/.rels", dados: enc.encode(RELS) },
    { nome: "word/document.xml", dados: enc.encode(documento) },
    { nome: "word/_rels/document.xml.rels", dados: enc.encode(RELS_DOC) },
    { nome: "word/styles.xml", dados: enc.encode(ESTILOS) },
    { nome: "docProps/core.xml", dados: enc.encode(core) },
  ]);
}

/** Nome do arquivo: voicecheck-relatorio-<paciente sem acento>-AAAAMMDD.docx */
export function nomeArquivoDocx(paciente: string, quando = new Date()): string {
  const base = paciente.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "paciente";
  return `voicecheck-relatorio-${base}-${quando.toISOString().slice(0, 10).replace(/-/g, "")}.docx`;
}
