/**
 * Contas do Painel inicial (sem DOM, testáveis): agenda de hoje e tempo desde a última
 * avaliação de cada paciente (como o "aging" de faturas: 0–30, 31–60, 61–90 e 90+ dias).
 */
import { ativa, chaveDia } from "@/lib/voz-clinica-agenda";
import type { Consulta, PacienteResumo, SituacaoConsulta } from "@/lib/voz-clinica-api";

const DIA_MS = 86_400_000;

export type FaixaReavaliacao = {
  rotulo: string;
  /** Dias desde a última avaliação: de `min` até `max` (inclusive); `max` nulo = sem limite. */
  min: number;
  max: number | null;
  pacientes: number;
  /** Faixa que pede atenção (passou de 90 dias sem reavaliar). */
  alerta: boolean;
};

const FAIXAS: Array<Pick<FaixaReavaliacao, "rotulo" | "min" | "max" | "alerta">> = [
  { rotulo: "0–30", min: 0, max: 30, alerta: false },
  { rotulo: "31–60", min: 31, max: 60, alerta: false },
  { rotulo: "61–90", min: 61, max: 90, alerta: false },
  { rotulo: "90+", min: 91, max: null, alerta: true },
];

/** Dias inteiros entre a última avaliação e agora (nunca negativo). Data inválida → null. */
export function diasDesde(iso: string, agora = new Date()): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((agora.getTime() - t) / DIA_MS));
}

/** Quantos pacientes estão em cada faixa de dias desde a última avaliação. */
export function faixasReavaliacao(pacientes: PacienteResumo[], agora = new Date()): FaixaReavaliacao[] {
  const faixas = FAIXAS.map((f) => ({ ...f, pacientes: 0 }));
  for (const p of pacientes) {
    const d = diasDesde(p.ultima, agora);
    if (d == null) continue;
    const f = faixas.find((x) => d >= x.min && (x.max == null || d <= x.max));
    if (f) f.pacientes += 1;
  }
  return faixas;
}

export type FiltroAgendaHoje = "todas" | "agendada" | "confirmada" | "realizada";

/** Consultas de hoje (fuso local), em ordem de horário; canceladas ficam de fora. */
export function consultasDeHoje(consultas: Consulta[], agora = new Date()): Consulta[] {
  const hoje = chaveDia(agora);
  return consultas
    .filter((c) => ativa(c) && chaveDia(new Date(c.inicio)) === hoje)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export function filtrarAgendaHoje(consultas: Consulta[], filtro: FiltroAgendaHoje): Consulta[] {
  return filtro === "todas" ? consultas : consultas.filter((c) => c.situacao === filtro);
}

export function contarPorSituacao(consultas: Consulta[]): Record<SituacaoConsulta, number> {
  const r: Record<SituacaoConsulta, number> = { agendada: 0, confirmada: 0, realizada: 0, faltou: 0, cancelada: 0 };
  for (const c of consultas) r[c.situacao] += 1;
  return r;
}

/** Próxima consulta ainda por acontecer (agendada ou confirmada), a partir de agora. */
export function proximaConsulta(consultas: Consulta[], agora = new Date()): Consulta | null {
  const t = agora.getTime();
  return (
    consultas
      .filter((c) => (c.situacao === "agendada" || c.situacao === "confirmada") && new Date(c.fim).getTime() > t)
      .sort((a, b) => a.inicio.localeCompare(b.inicio))[0] ?? null
  );
}
