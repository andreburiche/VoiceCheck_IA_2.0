import { cn } from "@/lib/utils";

/** Painel de vidro com cabeçalho de instrumento. */
export function Panel({
  title,
  subtitle,
  aside,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
  id,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Ações ou indicadores à direita do título */
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "article" | "aside";
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Tag
      id={id}
      aria-labelledby={title && headingId ? headingId : undefined}
      className={cn("panel-glass relative overflow-hidden rounded-2xl", className)}
    >
      {title || aside ? (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4">
          <div className="min-w-0">
            {title ? (
              <h2 id={headingId} className="truncate font-display text-base font-semibold text-ink">
                {title}
              </h2>
            ) : null}
            {subtitle ? <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p> : null}
          </div>
          {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-5", title || aside ? "pt-4" : null, bodyClassName)}>{children}</div>
    </Tag>
  );
}
