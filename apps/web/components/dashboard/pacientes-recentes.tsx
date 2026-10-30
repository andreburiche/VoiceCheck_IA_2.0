"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Stethoscope } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listarPacientes, type PacienteResumo } from "@/lib/voz-clinica-api";

const dataCurta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

/**
 * Painel inicial: os pacientes da avaliação clínica com atendimento mais recente.
 * O nome nunca vai para a URL (LGPD): o link abre a avaliação clínica, onde se escolhe o paciente.
 */
export function PacientesRecentes({ className }: { className?: string }) {
  const lista = useQuery({ queryKey: ["voz-pacientes"], queryFn: () => listarPacientes(), retry: false });
  const itens: PacienteResumo[] = [...(lista.data?.items ?? [])].sort((a, b) => +new Date(b.ultima) - +new Date(a.ultima));
  const avaliacoes = itens.reduce((s, p) => s + (p.avaliacoes || 0), 0);

  return (
    <section aria-labelledby="pacientes-recentes-t" className={`panel-glass flex min-w-0 flex-col rounded-2xl ${className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 id="pacientes-recentes-t" className="font-display text-base font-semibold text-ink">
            Avaliação clínica
          </h2>
          <p className="text-sm text-ink-muted">Pacientes com atendimento mais recente</p>
        </div>
        <dl className="flex gap-6 text-right">
          <div>
            <dt className="hud-label">Pacientes</dt>
            <dd className="text-data text-xl font-semibold text-ink">{lista.isLoading ? "—" : itens.length}</dd>
          </div>
          <div>
            <dt className="hud-label">Avaliações</dt>
            <dd className="text-data text-xl font-semibold text-ink">{lista.isLoading ? "—" : avaliacoes}</dd>
          </div>
        </dl>
      </header>

      <div className="flex-1 px-5 pb-5 pt-4">
        {lista.isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <span className="sr-only" role="status">Carregando pacientes…</span>
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
          </div>
        ) : lista.isError ? (
          <p className="text-sm text-ink-muted">Não foi possível carregar os pacientes agora. Abra a avaliação clínica para tentar de novo.</p>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line px-5 py-6">
            <Stethoscope className="h-5 w-5 text-accent" aria-hidden />
            <p className="max-w-md text-sm text-ink-muted">
              Cadastre o primeiro paciente para gravar, medir (jitter, shimmer, CPPS, fonetograma) e acompanhar a evolução no mesmo prontuário.
            </p>
            <Link href="/voz-clinica" className={buttonVariants({ size: "sm" })}>Cadastrar paciente</Link>
          </div>
        ) : (
          <ul className="divide-y divide-line/60 border-y border-line/60">
            {itens.slice(0, 5).map((p, i) => (
              <li
                key={p.paciente}
                className="flex items-center justify-between gap-4 py-2.5 motion-safe:animate-fade-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className="min-w-0 truncate text-sm font-medium text-ink" title={p.paciente}>{p.paciente}</span>
                <span className="flex shrink-0 items-baseline gap-4 text-xs text-ink-muted">
                  <span><span className="text-data text-sm text-ink">{p.avaliacoes}</span> {p.avaliacoes === 1 ? "avaliação" : "avaliações"}</span>
                  <span className="text-data w-14 text-right">{dataCurta(p.ultima)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {itens.length > 0 ? (
        <footer className="border-t border-line/60 px-5 py-3">
          <Link href="/voz-clinica" className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
            Abrir a avaliação clínica
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
          </Link>
        </footer>
      ) : null}
    </section>
  );
}
