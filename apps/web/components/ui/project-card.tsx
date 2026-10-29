import Link from "next/link";

import { CoverArt } from "@/components/library/cover-art";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDuration } from "@/lib/format";

type ProjectCardProps = {
  href: string;
  title: string;
  artist?: string | null;
  durationMs?: number | null;
  stemCount: number;
  status: string;
};

/** Cartão compacto de música (painel). Mesma anatomia do cartão de Projetos e da Biblioteca. */
export function ProjectCard({ href, title, artist, durationMs, stemCount, status }: ProjectCardProps) {
  return (
    <Link
      href={href}
      className="panel-glass group flex min-w-0 flex-col gap-4 rounded-xl p-4 transition-colors duration-ui hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
    >
      <div className="flex min-w-0 items-center gap-3">
        <CoverArt seed={href} title={title} />
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink group-hover:text-accent">{title}</h3>
          <p className="truncate text-sm text-ink-muted">{artist || "Sem artista"}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-3 border-t border-line/60 pt-3 text-xs text-ink-muted">
        <span className="text-data">
          {stemCount} {stemCount === 1 ? "faixa" : "faixas"}
        </span>
        <span className="text-data">{formatDuration(durationMs)}</span>
        <StatusPill status={status} className="ml-auto" />
      </div>
    </Link>
  );
}
