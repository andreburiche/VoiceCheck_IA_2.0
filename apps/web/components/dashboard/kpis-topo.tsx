import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type Kpi = {
  icone: LucideIcon;
  valor: string;
  rotulo: string;
  /** Etiqueta curta ao lado do número (ex.: "3 há +90 dias"). */
  etiqueta?: string;
  /** Etiqueta em tom de atenção (laranja). */
  alerta?: boolean;
};

/** Números principais ao lado do título do Painel: ícone em círculo, valor e legenda. */
export function KpisTopo({ itens, carregando = false }: { itens: Kpi[]; carregando?: boolean }) {
  return (
    <dl className="flex flex-wrap gap-x-7 gap-y-4 xl:flex-nowrap" aria-busy={carregando || undefined}>
      {itens.map(({ icone: Icone, valor, rotulo, etiqueta, alerta }) => (
        <div key={rotulo} className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-ink-muted ring-1 ring-inset ring-ink/10" aria-hidden>
            <Icone className="h-[18px] w-[18px]" />
          </span>
          <div className="flex flex-col-reverse">
            <dt className="text-xs text-ink-muted">{rotulo}</dt>
            <dd className="flex items-center gap-2">
              <span className="text-data text-xl font-semibold text-ink">{carregando ? "—" : valor}</span>
              {!carregando && etiqueta ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    alerta ? "bg-flare/15 text-flare" : "bg-accent/15 text-accent",
                  )}
                >
                  {etiqueta}
                </span>
              ) : null}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
