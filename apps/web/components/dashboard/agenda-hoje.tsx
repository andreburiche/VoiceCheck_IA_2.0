"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { CartaoPainel } from "@/components/dashboard/cartao-painel";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { consultasDeHoje, contarPorSituacao, filtrarAgendaHoje, type FiltroAgendaHoje } from "@/lib/painel";
import { ROTULO_MODALIDADE, ROTULO_SITUACAO, ROTULO_TIPO_CONSULTA, horaBR } from "@/lib/voz-clinica-agenda";
import type { Consulta, SituacaoConsulta } from "@/lib/voz-clinica-api";
import { cn } from "@/lib/utils";

const FILTROS: Array<{ valor: FiltroAgendaHoje; rotulo: string }> = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "agendada", rotulo: "Agendadas" },
  { valor: "confirmada", rotulo: "Confirmadas" },
  { valor: "realizada", rotulo: "Realizadas" },
];

const TOM_SITUACAO: Record<SituacaoConsulta, string> = {
  agendada: "bg-ink/[0.07] text-ink-muted",
  confirmada: "bg-accent/15 text-accent",
  realizada: "bg-brand-blue/15 text-brand-blue",
  faltou: "bg-flare/15 text-flare",
  cancelada: "bg-ink/[0.05] text-ink-faint",
};

/** Agenda de hoje no Painel: consultas do dia em ordem, com filtro por situação (pílulas). */
export function AgendaHoje({
  consultas,
  carregando,
  erro,
  className,
}: {
  consultas: Consulta[] | undefined;
  carregando: boolean;
  erro: boolean;
  className?: string;
}) {
  const [filtro, setFiltro] = useState<FiltroAgendaHoje>("todas");
  const hoje = consultasDeHoje(consultas ?? []);
  const contagem = contarPorSituacao(hoje);
  const lista = filtrarAgendaHoje(hoje, filtro);
  const dataHoje = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <CartaoPainel
      id="agenda-hoje"
      titulo="Agenda de hoje"
      subtitulo={<span className="first-letter:uppercase">{dataHoje}</span>}
      href="/voz-clinica/agenda"
      hrefRotulo="Abrir a agenda completa"
      className={className}
    >
      <div role="group" aria-label="Filtrar consultas de hoje" className="flex max-w-full gap-1 self-start overflow-x-auto overscroll-x-contain rounded-full bg-ink/[0.05] p-1 [scrollbar-width:none]">
        {FILTROS.map((f) => {
          const n = f.valor === "todas" ? hoje.length : contagem[f.valor];
          const ativo = filtro === f.valor;
          return (
            <button
              key={f.valor}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltro(f.valor)}
              className={cn(
                "inline-flex min-h-9 toque:min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                ativo ? "bg-canvas-raised text-ink shadow-sm ring-1 ring-inset ring-ink/10" : "text-ink-muted hover:text-ink",
              )}
            >
              {f.rotulo}
              <span className="text-data text-xs text-ink-faint">{carregando ? "" : n}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex-1" aria-live="polite">
        {carregando ? (
          <div className="space-y-2" aria-busy="true">
            <span className="sr-only" role="status">Carregando a agenda…</span>
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : erro ? (
          <p className="text-sm text-ink-muted">Não foi possível carregar a agenda agora. Abra a agenda completa para tentar de novo.</p>
        ) : hoje.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-start justify-center gap-3 rounded-2xl border border-dashed border-line px-5 py-6">
            <CalendarDays className="h-5 w-5 text-accent" aria-hidden />
            <p className="max-w-md text-sm text-ink-muted">Nenhuma consulta para hoje. As próximas aparecem na agenda da semana.</p>
            <Link href="/voz-clinica/agenda" className={buttonVariants({ size: "sm", variant: "secondary" })}>Ver a semana</Link>
          </div>
        ) : lista.length === 0 ? (
          <p className="py-6 text-sm text-ink-muted">Nenhuma consulta com essa situação hoje.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {lista.map((c) => (
              <li key={c.id} className="flex items-center gap-4 py-3">
                <span className="text-data w-14 shrink-0 text-base font-semibold text-ink">{horaBR(c.inicio)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink" title={c.paciente}>{c.paciente}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {ROTULO_TIPO_CONSULTA[c.tipo]} · {ROTULO_MODALIDADE[c.modalidade]} · {c.duracao_min} min
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", TOM_SITUACAO[c.situacao])}>
                  {ROTULO_SITUACAO[c.situacao]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CartaoPainel>
  );
}
