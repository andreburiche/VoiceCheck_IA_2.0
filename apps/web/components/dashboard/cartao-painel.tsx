import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Cartão do Painel: título, linha de apoio e, no canto, um botão redondo "abrir" (↗) que leva à
 * página completa. As ações extras (filtros, pílulas) entram em `acoes`, ao lado do botão.
 */
export function CartaoPainel({
  id,
  titulo,
  subtitulo,
  href,
  hrefRotulo,
  acoes,
  children,
  className,
}: {
  id: string;
  titulo: string;
  subtitulo?: React.ReactNode;
  href?: string;
  /** Nome do botão ↗ para leitor de tela (ex.: "Abrir a agenda"). */
  hrefRotulo?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-t`} className={cn("panel-glass flex min-w-0 flex-col rounded-2xl p-5", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-t`} className="font-display text-base font-semibold text-ink">{titulo}</h2>
          {subtitulo ? <p className="mt-0.5 text-sm text-ink-muted">{subtitulo}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {acoes}
          {href ? (
            <Link
              href={href}
              aria-label={hrefRotulo ?? `Abrir ${titulo}`}
              title={hrefRotulo ?? `Abrir ${titulo}`}
              className="inline-flex h-9 w-9 toque:h-11 toque:w-11 items-center justify-center rounded-full text-ink-muted ring-1 ring-inset ring-ink/15 transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </header>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}
