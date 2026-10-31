/**
 * VoiceCheck IA 2.0 — documentos para o paciente (aba Documentos).
 *
 * Cada modelo gera um RASCUNHO de texto a partir do prontuário (cadastro, anamnese, últimas
 * medidas e protocolos). O profissional revisa e edita na tela antes de emitir; o que fica entre
 * colchetes ([...]) é para completar. O texto final é guardado como texto puro e impresso por
 * `htmlDocumento`, que escapa tudo (nunca vira HTML).
 *
 * Os modelos são pontos de partida: atestados e declarações seguem as normas do conselho
 * (CFFa/CRFa), que o profissional confere.
 */
import { esc } from "@/lib/voicecheck-report-shared";
import type { Anamnese } from "@/lib/voz-clinica-anamnese";
import {
  ROTULO_TIPO,
  dataBR,
  resumoAvaliacao,
  type AnaliseAcustica,
  type Avaliacao,
  type CadastroPaciente,
  type ResultadoFonetograma,
  type ResultadoIdv10,
  type ResultadoQvv,
  type ResultadoSessao,
  type TipoAvaliacao,
} from "@/lib/voz-clinica-api";
import { pontoDdf } from "@/lib/voz-clinica-ddf";

export type ModeloDocumento =
  | "devolutiva" | "relatorio" | "encaminhamento_orl" | "encaminhamento" | "comparecimento" | "atestado"
  | "plano" | "orientacoes" | "consentimento";

export const MODELOS: { id: ModeloDocumento; titulo: string; descricao: string }[] = [
  { id: "devolutiva", titulo: "Devolutiva ao paciente", descricao: "O resultado da avaliação em linguagem simples, com o que vamos trabalhar." },
  { id: "relatorio", titulo: "Relatório fonoaudiológico", descricao: "Versão formal para outro profissional, escola ou convênio." },
  { id: "encaminhamento_orl", titulo: "Encaminhamento ao otorrino", descricao: "Avaliação laríngea (videolaringoscopia ou nasofibrolaringoscopia), com os achados." },
  { id: "encaminhamento", titulo: "Outro encaminhamento", descricao: "Audiologia, neurologia, psicologia, endocrinologia ou outra especialidade." },
  { id: "comparecimento", titulo: "Declaração de comparecimento", descricao: "Comprova o atendimento na data e no horário." },
  { id: "atestado", titulo: "Atestado fonoaudiológico", descricao: "Afastamento do uso profissional da voz por um período." },
  { id: "plano", titulo: "Plano terapêutico", descricao: "Objetivos, estratégias, frequência e reavaliação." },
  { id: "orientacoes", titulo: "Orientações de saúde vocal", descricao: "Cuidados com a voz para levar para casa." },
  { id: "consentimento", titulo: "Termo de consentimento", descricao: "Avaliação, terapia e uso de gravações e imagens (LGPD)." },
];

export const ESPECIALIDADES = [
  "audiológica (audiometria e imitanciometria)",
  "neurológica",
  "psicológica",
  "endocrinológica",
  "gastroenterológica (refluxo)",
  "pneumológica",
] as const;

export type Profissional = { nome: string; registro: string; contato: string; cidade: string };
export const PROFISSIONAL_VAZIO: Profissional = { nome: "", registro: "", contato: "", cidade: "" };

/** Campos que só alguns modelos usam. */
export type Extras = {
  especialidade?: string;
  horaInicio?: string;
  horaFim?: string;
  dias?: number;
  /** AAAA-MM-DD */
  inicio?: string;
  frequencia?: string;
  duracao?: string;
};

export type Contexto = {
  paciente: string;
  cadastro: CadastroPaciente | null;
  itens: Avaliacao[];
  hoje: Date;
  extras?: Extras;
};

// ---------------------------------------------------------------------------
// Dados do prontuário
// ---------------------------------------------------------------------------

function ultimo(itens: Avaliacao[], tipo: TipoAvaliacao): Avaliacao | undefined {
  return itens.filter((a) => a.tipo === tipo).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
}

const ORDEM_ACHADOS: TipoAvaliacao[] = [
  "acustica", "cepstral", "dsi", "fonetograma", "fala", "ddk", "nasalancia", "egg",
  "grbasi", "perceptiva", "idv10", "qvv", "easebr",
];

/** Uma linha por medida/protocolo (o mais recente de cada), com a data. */
export function achados(itens: Avaliacao[]): string[] {
  const linhas: string[] = [];
  for (const tipo of ORDEM_ACHADOS) {
    const a = ultimo(itens, tipo);
    if (!a) continue;
    let resumo = "";
    try {
      resumo = resumoAvaliacao(a);
    } catch {
      continue; // registro antigo com formato diferente: fica de fora do rascunho
    }
    if (resumo) linhas.push(`• ${ROTULO_TIPO[a.tipo]} (${dataBR(a.criado_em)}): ${resumo}`);
  }
  return linhas;
}

function idade(c: CadastroPaciente | null): string {
  return typeof c?.idade === "number" ? `${c.idade} anos` : "";
}

function queixa(itens: Avaliacao[]): string {
  const a = ultimo(itens, "anamnese");
  return ((a?.resultado as Anamnese | undefined)?.queixa ?? "").trim();
}

function identificacao(ctx: Contexto): string {
  const partes = [ctx.paciente, idade(ctx.cadastro), ctx.cadastro?.profissao?.trim() || ""].filter(Boolean);
  return partes.join(", ");
}

export function dataExtenso(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

function dataDe(iso: string | undefined, hoje: Date): string {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return dataBR(iso);
  return hoje.toLocaleDateString("pt-BR");
}

const EXTENSO = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez",
  "onze", "doze", "treze", "catorze", "quinze"];

function dias(n: number): string {
  const ext = EXTENSO[n];
  return `${n}${ext ? ` (${ext})` : ""} ${n === 1 ? "dia" : "dias"}`;
}

/** Frases simples para o paciente, só com o que foi medido. */
function frasesDevolutiva(itens: Avaliacao[]): string[] {
  const f: string[] = [];
  const ac = ultimo(itens, "acustica");
  const p = ac ? pontoDdf(ac.resultado as AnaliseAcustica) : null;
  if (p) {
    f.push({
      normal: "• A vibração da sua voz ficou dentro dos valores esperados na gravação da vogal.",
      irregularidade: "• A vibração da sua voz está mais irregular do que o esperado; isso costuma soar como uma voz mais áspera ou rouca.",
      ruido: "• Há mais ruído de ar na sua voz do que o esperado; isso costuma soar como uma voz mais soprosa.",
      ambos: "• A vibração da sua voz está irregular e com ruído de ar; isso costuma soar como uma voz rouca e soprosa.",
    }[p.quadrante]);
  }
  const fon = ultimo(itens, "fonetograma")?.resultado as ResultadoFonetograma | undefined;
  if (fon?.resumo?.nota_grave && fon.resumo.nota_aguda) {
    f.push(`• Sua voz alcançou da nota ${fon.resumo.nota_grave} até ${fon.resumo.nota_aguda} (${fon.resumo.extensao_st} semitons).`);
  }
  const idv = ultimo(itens, "idv10")?.resultado as ResultadoIdv10 | undefined;
  if (idv && typeof idv.total === "number") {
    f.push(idv.acima_do_corte
      ? `• Pelas suas respostas no questionário IDV-10 (${idv.total} de ${idv.maximo} pontos), a voz está atrapalhando o seu dia a dia.`
      : `• Pelas suas respostas no questionário IDV-10 (${idv.total} de ${idv.maximo} pontos), a voz não está atrapalhando muito o seu dia a dia.`);
  }
  const qvv = ultimo(itens, "qvv")?.resultado as ResultadoQvv | undefined;
  if (qvv && typeof qvv.total === "number") {
    f.push(qvv.abaixo_do_corte
      ? `• No questionário de qualidade de vida em voz (QVV), a pontuação ficou em ${qvv.total}: a voz está afetando a sua qualidade de vida.`
      : `• No questionário de qualidade de vida em voz (QVV), a pontuação ficou em ${qvv.total}: a voz afeta pouco a sua qualidade de vida.`);
  }
  return f;
}

// ---------------------------------------------------------------------------
// Rascunhos
// ---------------------------------------------------------------------------

const PENDENTE = /\[[^\]\n]{1,80}\]/g;

/** Trechos ainda entre colchetes, para avisar antes de emitir. */
export function pendencias(texto: string): string[] {
  return [...new Set(texto.match(PENDENTE) ?? [])];
}

export function gerarRascunho(modelo: ModeloDocumento, ctx: Contexto): { titulo: string; corpo: string } {
  const ex = ctx.extras ?? {};
  const nome = ctx.paciente.trim() || "[nome do paciente]";
  const ident = identificacao({ ...ctx, paciente: nome });
  const q = queixa(ctx.itens) || "[queixa vocal]";
  const lista = achados(ctx.itens);
  const blocoAchados = lista.length ? lista.join("\n") : "• [achados da avaliação fonoaudiológica]";
  const hoje = ctx.hoje.toLocaleDateString("pt-BR");

  switch (modelo) {
    case "devolutiva": {
      const frases = frasesDevolutiva(ctx.itens);
      return {
        titulo: "Devolutiva da avaliação vocal",
        corpo: [
          `Olá, ${nome.split(" ")[0]}.`,
          "Este é o resumo da sua avaliação de voz, em palavras simples.",
          "O que encontramos:",
          frases.length ? frases.join("\n") : "• [resultado da avaliação em palavras simples]",
          "O que vamos trabalhar:",
          "• [objetivo 1]\n• [objetivo 2]",
          "Cuidados até a próxima sessão:",
          "• Beba água ao longo do dia.\n• Evite gritar e falar por muito tempo em lugares barulhentos.\n• Faça os exercícios combinados, do jeito que treinamos.",
          "Este resumo mostra a avaliação fonoaudiológica e não substitui a avaliação médica. Em caso de dúvida, fale comigo.",
        ].join("\n\n"),
      };
    }
    case "relatorio":
      return {
        titulo: "Relatório fonoaudiológico",
        corpo: [
          `Identificação: ${ident}.`,
          `Queixa: ${q}.`,
          `Procedimentos realizados: ${procedimentos(ctx.itens) || "[procedimentos]"}.`,
          `Resultados:\n${blocoAchados}`,
          "Conclusão: [conclusão fonoaudiológica]",
          "Conduta: [conduta proposta]",
        ].join("\n\n"),
      };
    case "encaminhamento_orl":
      return {
        titulo: "Encaminhamento",
        corpo: [
          "Ao(À) médico(a) otorrinolaringologista,",
          `Encaminho ${ident}, em avaliação fonoaudiológica por queixa de ${q}, para avaliação otorrinolaringológica com exame visual da laringe (videolaringoscopia ou nasofibrolaringoscopia), a critério médico.`,
          `Achados da avaliação fonoaudiológica:\n${blocoAchados}`,
          "Solicito, se possível, o envio do laudo do exame para a continuidade da conduta fonoaudiológica.",
          "Atenciosamente,",
        ].join("\n\n"),
      };
    case "encaminhamento":
      return {
        titulo: "Encaminhamento",
        corpo: [
          "Ao(À) profissional responsável,",
          `Encaminho ${ident}, em acompanhamento fonoaudiológico, para avaliação ${ex.especialidade || "[especialidade]"}, em razão de [motivo do encaminhamento].`,
          `Achados da avaliação fonoaudiológica:\n${blocoAchados}`,
          "Coloco-me à disposição para troca de informações sobre o caso.",
          "Atenciosamente,",
        ].join("\n\n"),
      };
    case "comparecimento":
      return {
        titulo: "Declaração de comparecimento",
        corpo: `Declaro, para os devidos fins, que ${nome} compareceu a atendimento fonoaudiológico no dia ${dataDe(ex.inicio, ctx.hoje)}, das ${ex.horaInicio || "[hora de início]"} às ${ex.horaFim || "[hora de término]"}.`,
      };
    case "atestado":
      return {
        titulo: "Atestado fonoaudiológico",
        corpo: `Atesto, para os devidos fins, que ${nome} encontra-se em acompanhamento fonoaudiológico e necessita de afastamento das atividades que exigem uso profissional da voz por ${ex.dias && ex.dias > 0 ? dias(ex.dias) : "[número de dias]"}, a partir de ${dataDe(ex.inicio, ctx.hoje)}, para [motivo: repouso vocal, recuperação após procedimento...].`,
      };
    case "plano": {
      const sessao = ultimo(ctx.itens, "sessao")?.resultado as ResultadoSessao | undefined;
      const estrategias = sessao?.exercicios_lista?.length ? sessao.exercicios_lista.map((e) => `• ${e}`).join("\n") : "• [estratégia 1]\n• [estratégia 2]";
      return {
        titulo: "Plano terapêutico",
        corpo: [
          `Paciente: ${ident}.`,
          `Queixa: ${q}.`,
          `Achados iniciais:\n${blocoAchados}`,
          "Objetivos:\n1. [objetivo]\n2. [objetivo]\n3. [objetivo]",
          `Estratégias:\n${estrategias}`,
          `Frequência: ${ex.frequencia || "1 sessão por semana"}. Duração estimada: ${ex.duracao || "12 sessões"}.`,
          "Reavaliação: ao fim do período, com as mesmas medidas e protocolos desta avaliação, para comparar.",
          "Tarefas em casa: exercícios enviados pelo link de prática em casa, com os resultados registrados no prontuário.",
        ].join("\n\n"),
      };
    }
    case "orientacoes":
      return {
        titulo: "Orientações de saúde vocal",
        corpo: [
          `Orientações para ${nome}:`,
          [
            "• Beba água ao longo do dia, em pequenos goles.",
            "• Evite gritar, falar muito alto ou competir com o barulho (música alta, ambientes ruidosos).",
            "• Evite pigarrear e tossir com força; prefira engolir em seco ou tomar um gole de água.",
            "• Faça pausas: depois de muito tempo falando ou cantando, descanse a voz alguns minutos.",
            "• Aqueça a voz antes de usá-la por muito tempo e desaqueça depois, com os exercícios combinados.",
            "• Durma bem: o cansaço aparece na voz.",
            "• Evite cigarro e excesso de álcool.",
            "• Se tiver azia ou refluxo, comente com o seu médico.",
            "• Rouquidão por mais de 15 dias precisa de avaliação médica.",
          ].join("\n"),
          "Orientações específicas: [orientações para este paciente]",
        ].join("\n\n"),
      };
    case "consentimento":
      return {
        titulo: "Termo de consentimento",
        corpo: [
          `Eu, ${nome}${ctx.cadastro?.data_nascimento ? `, nascido(a) em ${dataBR(ctx.cadastro.data_nascimento)}` : ""}, autorizo a realização de avaliação e terapia fonoaudiológica da voz.`,
          "Autorizo a gravação da minha voz e, quando necessário, de imagens e vídeos, com a finalidade exclusiva de avaliação, acompanhamento da evolução e documentação clínica.",
          "Fui informado(a) de que esses dados são guardados no prontuário com acesso restrito, de que posso pedir acesso, cópia ou correção deles e de que posso retirar este consentimento a qualquer momento, sem prejuízo do atendimento, respeitado o prazo de guarda do prontuário (Lei Geral de Proteção de Dados, Lei nº 13.709/2018).",
          "Os resultados das medidas acústicas apoiam a avaliação fonoaudiológica e não substituem a avaliação médica.",
        ].join("\n\n"),
      };
  }
}

function procedimentos(itens: Avaliacao[]): string {
  const tipos = [...new Set(itens.filter((a) => a.tipo !== "documento" && a.tipo !== "midia").map((a) => a.tipo))];
  return tipos.map((t) => ROTULO_TIPO[t].toLowerCase()).join(", ");
}

// ---------------------------------------------------------------------------
// Impressão
// ---------------------------------------------------------------------------

export type DocumentoEmitido = {
  modelo: ModeloDocumento;
  titulo: string;
  corpo: string;
  profissional: { nome: string; registro?: string | null; contato?: string | null; cidade?: string | null };
  emitido_em?: string;
};

/**
 * Marcação simples da barra de ferramentas → HTML. Escapa PRIMEIRO e só depois troca
 * **negrito** e _itálico_ por tags fixas: nada do texto vira HTML.
 */
export function formatarLinha(texto: string): string {
  return esc(texto)
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(«"“])_(?=\S)([^_\n]*?\S)_(?=$|[\s).,;:!?»"”])/g, "$1<em>$2</em>");
}

/** Texto do documento → parágrafos, subtítulos ("## "), listas ("• ", "- ", "1. "), negrito e itálico. */
export function corpoHtml(corpo: string): string {
  const item = /^\s*(•|-|\d+\.)\s/;
  const lista = (ls: string[]) => {
    const numerada = ls.every((l) => /^\s*\d+\.\s/.test(l));
    const tag = numerada ? "ol" : "ul";
    return `<${tag}>${ls.map((l) => `<li>${formatarLinha(l.replace(item, ""))}</li>`).join("")}</${tag}>`;
  };
  return corpo
    .trim()
    .split(/\n{2,}/)
    .map((bloco) => {
      const linhas = bloco.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
      const partes: string[] = [];
      let paragrafo: string[] = [];
      let itens: string[] = [];
      const fechar = () => {
        if (paragrafo.length) partes.push(`<p>${paragrafo.map(formatarLinha).join("<br/>")}</p>`);
        if (itens.length) partes.push(lista(itens));
        paragrafo = [];
        itens = [];
      };
      for (const l of linhas) {
        if (/^##\s+/.test(l)) {
          fechar();
          partes.push(`<h2>${formatarLinha(l.replace(/^##\s+/, ""))}</h2>`);
        } else if (item.test(l)) {
          if (paragrafo.length) { partes.push(`<p>${paragrafo.map(formatarLinha).join("<br/>")}</p>`); paragrafo = []; }
          itens.push(l);
        } else {
          if (itens.length) { partes.push(lista(itens)); itens = []; }
          paragrafo.push(l);
        }
      }
      fechar();
      return partes.join("");
    })
    .join("\n");
}

const escRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Antes de mandar texto à IA: troca o nome completo por [PACIENTE] e o primeiro nome por
 * [PRIMEIRO_NOME] (sem diferenciar maiúsculas). `restaurar` desfaz a troca na resposta.
 */
export function anonimizar(texto: string, paciente: string): { texto: string; restaurar: (t: string) => string } {
  const nome = paciente.trim().replace(/\s+/g, " ");
  const primeiro = nome.split(" ")[0] ?? "";
  let t = texto;
  if (nome) t = t.replace(new RegExp(escRegex(nome).replace(/ /g, "\\s+"), "gi"), "[PACIENTE]");
  if (primeiro.length >= 3 && primeiro !== nome) {
    t = t.replace(new RegExp(`(^|[^\\p{L}])${escRegex(primeiro)}(?![\\p{L}])`, "giu"), "$1[PRIMEIRO_NOME]");
  }
  return {
    texto: t,
    restaurar: (r: string) => r.replace(/\[PACIENTE\]/g, nome || "[PACIENTE]").replace(/\[PRIMEIRO_NOME\]/g, primeiro || "[PACIENTE]"),
  };
}

/** Logo da aplicação para papel branco (partes brancas do lockup em grafite). */
export const LOGO_PAPEL = "/brand/voicecheck-lockup-v3-papel.png";

/**
 * Página A4 do documento. `logoUrl` deve ser absoluta (a página é escrita num iframe):
 * na tela, `${location.origin}${LOGO_PAPEL}`; sem ela, o cabeçalho sai só com o texto.
 */
export function htmlDocumento(doc: DocumentoEmitido, paciente: string, logoUrl?: string): string {
  const prof = doc.profissional;
  const quando = doc.emitido_em ? new Date(doc.emitido_em) : new Date();
  const local = `${prof.cidade ? `${prof.cidade}, ` : ""}${dataExtenso(quando)}.`;
  const assinaturaPaciente = doc.modelo === "consentimento"
    ? `<div class="assina"><div class="linha"></div><p>${esc(paciente)}<br/><span>paciente ou responsável legal</span></p></div>`
    : "";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${esc(doc.titulo)} — ${esc(paciente)}</title>
  <style>
    @page { size: A4; margin: 22mm 20mm; }
    body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #0E1A24; font-size: 11.5pt; line-height: 1.55; margin: 0; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 18pt;
             border-bottom: 1.5pt solid #0E8F8A; padding-bottom: 9pt; margin-bottom: 26pt; }
    header img { height: 38pt; width: auto; display: block; }
    header .prof { text-align: right; }
    header .prof.so { text-align: left; }
    header strong { font-size: 12.5pt; }
    header p { margin: 1pt 0; color: #4E6170; font-size: 9.5pt; }
    h1 { text-align: center; font-size: 15pt; letter-spacing: .02em; text-transform: uppercase; margin: 0 0 22pt; }
    p { margin: 0 0 10pt; text-align: justify; }
    ul, ol { margin: 0 0 10pt 16pt; padding: 0; }
    h2 { font-size: 12pt; margin: 14pt 0 6pt; }
    li { margin: 0 0 3pt; }
    .local { margin-top: 26pt; text-align: right; }
    .assinaturas { display: flex; gap: 28pt; justify-content: center; margin-top: 46pt; page-break-inside: avoid; }
    .assina { width: 230pt; text-align: center; }
    .assina .linha { border-top: 1pt solid #0E1A24; margin-bottom: 4pt; }
    .assina p { text-align: center; margin: 0; font-size: 10pt; }
    .assina span { color: #4E6170; font-size: 9pt; }
    footer { margin-top: 36pt; font-size: 8pt; color: #4E6170; border-top: 1pt solid #D6E1E6; padding-top: 5pt; }
    .actions { margin-bottom: 10pt; }
    .actions button { background: #0E8F8A; color: #fff; border: none; border-radius: 6pt; padding: 7pt 12pt; font-size: 10pt; cursor: pointer; }
    @media print { .actions { display: none; } }
  </style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Imprimir ou salvar PDF</button></div>
  <header>
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="VoiceCheck IA" />` : ""}
    <div class="prof${logoUrl ? "" : " so"}">
      <strong>${esc(prof.nome)}</strong>
      <p>Fonoaudiólogo(a)${prof.registro ? ` · ${esc(prof.registro)}` : ""}</p>
      ${prof.contato ? `<p>${esc(prof.contato)}</p>` : ""}
    </div>
  </header>
  <h1>${esc(doc.titulo)}</h1>
  ${corpoHtml(doc.corpo)}
  <p class="local">${esc(local)}</p>
  <div class="assinaturas">
    ${assinaturaPaciente}
    <div class="assina"><div class="linha"></div><p>${esc(prof.nome)}<br/><span>${esc(prof.registro || "Fonoaudiólogo(a)")}</span></p></div>
  </div>
  <footer>Documento emitido com o VoiceCheck IA em ${esc(quando.toLocaleString("pt-BR"))}.</footer>
</body>
</html>`;
}
