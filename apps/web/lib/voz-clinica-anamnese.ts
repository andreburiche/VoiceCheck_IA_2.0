/**
 * VoiceCheck IA 2.0 — anamnese vocal (opções, rótulos e resumo; puro, testável).
 * Os valores aceitos são os mesmos do esquema AnamneseEntrada da API.
 */

export const SINTOMAS = {
  rouquidao: "Rouquidão",
  cansaco_vocal: "Cansaço ao falar ou cantar",
  falhas_na_voz: "Falhas na voz",
  perda_de_agudos: "Perda de agudos",
  voz_fraca: "Voz fraca ou sem projeção",
  dor_ao_falar: "Dor ou ardência ao usar a voz",
  pigarro: "Pigarro",
  tosse: "Tosse frequente",
  corpo_estranho: "Sensação de algo na garganta",
  falta_de_ar_ao_falar: "Falta de ar ao falar",
} as const;
export type Sintoma = keyof typeof SINTOMAS;

export const INICIO = {
  menos_1_mes: "Menos de 1 mês",
  "1_a_6_meses": "1 a 6 meses",
  "6_a_12_meses": "6 a 12 meses",
  mais_1_ano: "Mais de 1 ano",
} as const;

export const EVOLUCAO = {
  melhorando: "Melhorando",
  estavel: "Estável",
  piorando: "Piorando",
  flutuante: "Varia (dias bons e ruins)",
} as const;

export const USO_PROFISSIONAL = {
  nao: "Não",
  fala: "Sim, fala",
  canto: "Sim, canto",
  fala_e_canto: "Sim, fala e canto",
} as const;

export const TABAGISMO = { nunca: "Nunca fumou", ex: "Ex-fumante", atual: "Fuma" } as const;
export const ALCOOL = { nao: "Não", ocasional: "Ocasional", frequente: "Frequente" } as const;

export type Anamnese = {
  queixa?: string;
  inicio?: keyof typeof INICIO;
  evolucao?: keyof typeof EVOLUCAO;
  sintomas?: Sintoma[];
  profissao?: string;
  uso_profissional?: keyof typeof USO_PROFISSIONAL;
  horas_voz_dia?: number;
  canto_estilo?: string;
  aulas_canto?: boolean;
  tabagismo?: keyof typeof TABAGISMO;
  alcool?: keyof typeof ALCOOL;
  agua_copos_dia?: number;
  refluxo?: boolean;
  alergia_respiratoria?: boolean;
  perda_auditiva?: boolean;
  fono_anterior?: boolean;
  cirurgias?: string;
  medicamentos?: string;
  observacoes?: string;
};

/** Perguntas de sim/não, na ordem do formulário. */
export const PERGUNTAS_SIM_NAO = [
  ["aulas_canto", "Faz ou fez aulas de canto"],
  ["refluxo", "Refluxo ou azia frequente"],
  ["alergia_respiratoria", "Rinite, sinusite ou alergia respiratória"],
  ["perda_auditiva", "Dificuldade para ouvir"],
  ["fono_anterior", "Já fez terapia fonoaudiológica para a voz"],
] as const;
type CampoSimNao = (typeof PERGUNTAS_SIM_NAO)[number][0];

/** Remove campos vazios (texto em branco, listas vazias, null) antes de enviar. */
export function limparAnamnese(a: Record<string, unknown>): Anamnese {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && !v.trim()) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (typeof v === "number" && !Number.isFinite(v)) continue;
    saida[k] = typeof v === "string" ? v.trim() : v;
  }
  return saida as Anamnese;
}

const numero = (v: number, casas = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

/** Linhas [rótulo, valor] com tudo o que foi preenchido (para o histórico expandido e o PDF). */
export function linhasAnamnese(a: Anamnese): [string, string][] {
  const l: [string, string][] = [];
  const add = (rotulo: string, valor: string | undefined | null) => {
    if (valor) l.push([rotulo, valor]);
  };
  add("Queixa principal", a.queixa);
  add("Há quanto tempo", a.inicio && INICIO[a.inicio]);
  add("Evolução", a.evolucao && EVOLUCAO[a.evolucao]);
  add("Sintomas", a.sintomas?.map((s) => SINTOMAS[s] ?? s).join(", "));
  add("Profissão", a.profissao);
  add("Usa a voz profissionalmente", a.uso_profissional && USO_PROFISSIONAL[a.uso_profissional]);
  add("Uso da voz por dia", a.horas_voz_dia !== undefined ? `${numero(a.horas_voz_dia)} h` : null);
  add("Estilo de canto", a.canto_estilo);
  add("Tabagismo", a.tabagismo && TABAGISMO[a.tabagismo]);
  add("Álcool", a.alcool && ALCOOL[a.alcool]);
  add("Água por dia", a.agua_copos_dia !== undefined ? `${a.agua_copos_dia} ${a.agua_copos_dia === 1 ? "copo" : "copos"}` : null);
  for (const [campo, rotulo] of PERGUNTAS_SIM_NAO) {
    const v = a[campo as CampoSimNao];
    if (v !== undefined) l.push([rotulo, v ? "Sim" : "Não"]);
  }
  add("Cirurgias ou intubações", a.cirurgias);
  add("Medicamentos em uso", a.medicamentos);
  add("Observações", a.observacoes);
  return l;
}

/** Uma linha para o histórico. */
export function resumoAnamnese(a: Anamnese): string {
  const partes: string[] = [];
  if (a.queixa) partes.push(a.queixa.length > 80 ? `${a.queixa.slice(0, 79).trimEnd()}…` : a.queixa);
  if (a.inicio) partes.push(INICIO[a.inicio].toLowerCase());
  if (a.sintomas?.length) partes.push(`${a.sintomas.length} ${a.sintomas.length === 1 ? "sintoma" : "sintomas"}`);
  if (a.uso_profissional && a.uso_profissional !== "nao") partes.push(`uso profissional (${USO_PROFISSIONAL[a.uso_profissional].replace("Sim, ", "")})`);
  return partes.length ? partes.join(" · ") : `${linhasAnamnese(a).length} campos preenchidos`;
}
