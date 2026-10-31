/**
 * Agenda de consultas e lista de pacientes da avaliação clínica: contas sem DOM (testáveis).
 * Datas da API chegam em UTC (ISO); a tela mostra no fuso de quem vê.
 */
import type {
  Avaliacao,
  Consulta,
  ModalidadeConsulta,
  PacienteResumo,
  SituacaoConsulta,
  TipoConsulta,
} from "@/lib/voz-clinica-api";

export const ROTULO_TIPO_CONSULTA: Record<TipoConsulta, string> = {
  avaliacao: "Avaliação",
  terapia: "Terapia",
  retorno: "Retorno",
  reavaliacao: "Reavaliação",
  outro: "Outro",
};

export const ROTULO_MODALIDADE: Record<ModalidadeConsulta, string> = {
  presencial: "Presencial",
  online: "On-line",
  domiciliar: "Domiciliar",
};

export const ROTULO_SITUACAO: Record<SituacaoConsulta, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  realizada: "Realizada",
  faltou: "Faltou",
  cancelada: "Cancelada",
};

export const DURACOES = [30, 40, 45, 50, 60, 90] as const;

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const dois = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" no fuso local. */
export function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Segunda-feira 00:00 (local) da semana de `d`. */
export function inicioDaSemana(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const desde = (r.getDay() + 6) % 7; // segunda = 0
  r.setDate(r.getDate() - desde);
  return r;
}

export function somarDias(d: Date, dias: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

/** Os 7 dias (segunda a domingo) a partir do início da semana. */
export function diasDaSemana(inicio: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i));
}

/** Data + hora digitadas (fuso local) → ISO com o deslocamento local, como a API pede. */
export function isoLocal(data: string, hora: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!m || !h) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(h[1]), Number(h[2]));
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(m[3])) return null;
  const off = -d.getTimezoneOffset();
  const sinal = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${data}T${hora}:00${sinal}${dois(Math.floor(a / 60))}:${dois(a % 60)}`;
}

/** ISO (UTC) → campos do formulário no fuso local. */
export function camposLocais(iso: string): { data: string; hora: string } {
  const d = new Date(iso);
  return { data: chaveDia(d), hora: `${dois(d.getHours())}:${dois(d.getMinutes())}` };
}

export function horaBR(iso: string): string {
  const d = new Date(iso);
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** "seg, 03 nov" */
export function diaCurtoBR(d: Date): string {
  return `${DIAS[d.getDay()]}, ${dois(d.getDate())} ${MESES[d.getMonth()]}`;
}

/** "seg, 03 nov 2026 · 14:00" */
export function dataHoraBR(iso: string): string {
  const d = new Date(iso);
  return `${diaCurtoBR(d)} ${d.getFullYear()} · ${horaBR(iso)}`;
}

/** "3 a 9 de nov de 2026" (ou atravessando o mês: "27 out a 2 nov de 2026") */
export function rotuloSemana(inicio: Date): string {
  const fim = somarDias(inicio, 6);
  const mesmoMes = inicio.getMonth() === fim.getMonth();
  return mesmoMes
    ? `${inicio.getDate()} a ${fim.getDate()} de ${MESES[fim.getMonth()]} de ${fim.getFullYear()}`
    : `${inicio.getDate()} ${MESES[inicio.getMonth()]} a ${fim.getDate()} ${MESES[fim.getMonth()]} de ${fim.getFullYear()}`;
}

/** Consultas agrupadas pelo dia local de início, em ordem de horário. */
export function porDia(consultas: Consulta[]): Map<string, Consulta[]> {
  const m = new Map<string, Consulta[]>();
  for (const c of [...consultas].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const k = chaveDia(new Date(c.inicio));
    const lista = m.get(k);
    if (lista) lista.push(c);
    else m.set(k, [c]);
  }
  return m;
}

/** Consultas que contam na ocupação do dia (cancelada libera o horário). */
export function ativa(c: Consulta): boolean {
  return c.situacao !== "cancelada";
}

export type Atendimento = {
  /** "YYYY-MM-DD" local */
  dia: string;
  consultas: Consulta[];
  avaliacoes: Avaliacao[];
};

/**
 * Histórico do paciente "por consulta": cada dia com atendimento junta o que foi agendado e tudo o
 * que foi registrado (análises, protocolos, documentos, mídias, sessões). Do mais recente ao mais antigo.
 * Consultas futuras ficam de fora (aparecem em "Próximas consultas").
 */
export function historicoPorAtendimento(avaliacoes: Avaliacao[], consultas: Consulta[], agora = new Date()): Atendimento[] {
  const m = new Map<string, Atendimento>();
  const pegar = (dia: string) => {
    let a = m.get(dia);
    if (!a) m.set(dia, (a = { dia, consultas: [], avaliacoes: [] }));
    return a;
  };
  for (const a of avaliacoes) pegar(chaveDia(new Date(a.criado_em))).avaliacoes.push(a);
  for (const c of consultas) {
    if (new Date(c.inicio) > agora && c.situacao !== "realizada" && c.situacao !== "faltou") continue;
    pegar(chaveDia(new Date(c.inicio))).consultas.push(c);
  }
  const lista = [...m.values()];
  for (const a of lista) {
    a.avaliacoes.sort((x, y) => x.criado_em.localeCompare(y.criado_em));
    a.consultas.sort((x, y) => x.inicio.localeCompare(y.inicio));
  }
  return lista.sort((x, y) => y.dia.localeCompare(x.dia));
}

/** Próximas consultas (a partir de agora, não canceladas), em ordem. */
export function proximas(consultas: Consulta[], agora = new Date()): Consulta[] {
  return consultas
    .filter((c) => ativa(c) && c.situacao !== "realizada" && c.situacao !== "faltou" && new Date(c.fim) > agora)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Frequência: realizadas / (realizadas + faltas), em %. Null sem consultas encerradas. */
export function assiduidade(consultas: Consulta[]): number | null {
  const r = consultas.filter((c) => c.situacao === "realizada").length;
  const f = consultas.filter((c) => c.situacao === "faltou").length;
  return r + f ? Math.round((100 * r) / (r + f)) : null;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type FiltroPacientes = "todos" | "com_consulta" | "sem_retorno";
export type OrdemPacientes = "recentes" | "nome" | "proxima";

/**
 * Busca sem acento e sem maiúsculas; "sem_retorno" = sem próxima consulta e último registro há mais
 * de 30 dias (quem pode estar esquecido).
 */
export function filtrarPacientes(
  lista: PacienteResumo[],
  termo: string,
  filtro: FiltroPacientes = "todos",
  ordem: OrdemPacientes = "recentes",
  agora = new Date(),
): PacienteResumo[] {
  const t = semAcento(termo.trim());
  const limite = agora.getTime() - 30 * 86_400_000;
  const r = lista.filter((p) => {
    if (t && !semAcento(p.paciente).includes(t)) return false;
    if (filtro === "com_consulta") return !!p.proxima_consulta;
    if (filtro === "sem_retorno") return !p.proxima_consulta && new Date(p.ultima).getTime() < limite;
    return true;
  });
  const porNome = (a: PacienteResumo, b: PacienteResumo) => a.paciente.localeCompare(b.paciente, "pt-BR");
  if (ordem === "nome") return r.sort(porNome);
  if (ordem === "proxima") {
    return r.sort((a, b) => {
      if (a.proxima_consulta && b.proxima_consulta) return a.proxima_consulta.localeCompare(b.proxima_consulta);
      if (a.proxima_consulta) return -1;
      if (b.proxima_consulta) return 1;
      return porNome(a, b);
    });
  }
  return r.sort((a, b) => b.ultima.localeCompare(a.ultima));
}

/** Iniciais para o avatar quando não há foto. */
export function iniciaisPaciente(nome: string): string {
  const partes = nome.split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const a = partes[0]![0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1]![0] ?? "" : "";
  return (a + b).toUpperCase();
}

/** Chave da sessionStorage para abrir um paciente na avaliação (o nome não vai na URL — LGPD). */
export const CHAVE_ABRIR_PACIENTE = "vc-abrir-paciente";
