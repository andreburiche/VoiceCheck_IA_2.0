"use client";

import { CartaoPainel } from "@/components/dashboard/cartao-painel";
import { Skeleton } from "@/components/ui/skeleton";
import { faixasReavaliacao } from "@/lib/painel";
import type { PacienteResumo } from "@/lib/voz-clinica-api";
import { cn } from "@/lib/utils";

/**
 * Há quanto tempo cada paciente não é avaliado, em faixas de dias (como o "aging" de faturas).
 * As barras são só visuais; os números ficam na lista abaixo, que o leitor de tela lê.
 */
export function Reavaliacao({
  pacientes,
  carregando,
  erro,
  className,
}: {
  pacientes: PacienteResumo[] | undefined;
  carregando: boolean;
  erro: boolean;
  className?: string;
}) {
  const faixas = faixasReavaliacao(pacientes ?? []);
  const maior = Math.max(1, ...faixas.map((f) => f.pacientes));

  return (
    <CartaoPainel
      id="reavaliacao"
      titulo="Reavaliação"
      subtitulo="Pacientes por dias desde a última avaliação"
      href="/voz-clinica/pacientes"
      hrefRotulo="Abrir a lista de pacientes"
      className={className}
    >
      {carregando ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : erro ? (
        <p className="text-sm text-ink-muted">Não foi possível carregar os pacientes agora.</p>
      ) : (
        <>
          <div className="grid h-36 grid-cols-4 gap-2.5" aria-hidden>
            {faixas.map((f) => (
              <div key={f.rotulo} className="flex flex-col">
                <div className="relative flex-1 overflow-hidden rounded-2xl bg-ink/[0.05]">
                  <div
                    className={cn(
                      "absolute inset-x-0 bottom-0 rounded-2xl transition-[height] duration-500 motion-reduce:transition-none",
                      f.alerta && f.pacientes > 0 ? "bg-flare/80" : "bg-ink-faint/45",
                    )}
                    style={{ height: f.pacientes === 0 ? "6%" : `${Math.max(14, (f.pacientes / maior) * 100)}%` }}
                  />
                </div>
                <span className="mt-1.5 text-center text-xs text-ink-muted">{f.rotulo}</span>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {faixas.map((f) => (
              <li key={f.rotulo} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-muted">
                  <span className={cn("h-2 w-2 rounded-full", f.alerta ? "bg-flare" : "bg-ink-faint/70")} aria-hidden />
                  {f.rotulo} dias
                </span>
                <span className={cn("text-data font-semibold", f.alerta && f.pacientes > 0 ? "text-flare" : "text-ink")}>
                  {f.pacientes} {f.pacientes === 1 ? "paciente" : "pacientes"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </CartaoPainel>
  );
}
