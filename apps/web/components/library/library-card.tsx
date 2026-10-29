"use client";

import Link from "next/link";
import { Star } from "lucide-react";

import { CoverArt } from "@/components/library/cover-art";
import { LibraryActionsMenu } from "@/components/library/library-actions-menu";
import type { LibraryCatalogItem } from "@/lib/library-catalog";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

type LibraryCardProps = {
  item: LibraryCatalogItem;
  isFavorite: boolean;
  showCollect?: boolean;
  showSetlist?: boolean;
  onOpenStudio: () => void;
  onPractice: () => void;
  onReprocess: () => void;
  onExport: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onCollect?: () => void;
  onAddToSetlist?: () => void;
};

export function LibraryCard({
  item,
  isFavorite,
  showCollect,
  showSetlist,
  onOpenStudio,
  onPractice,
  onReprocess,
  onExport,
  onRename,
  onToggleFavorite,
  onDelete,
  onCollect,
  onAddToSetlist,
}: LibraryCardProps) {
  const canStudio = item.stemCount > 0;
  const canExport = item.stemCount > 0;
  const canReprocess = item.hasOriginal;

  return (
    <article className="panel-glass group flex min-w-0 flex-col rounded-xl transition-colors duration-ui hover:border-line">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <CoverArt seed={item.projectId} title={item.name} />
          <div className="min-w-0 flex-1">
            <Link
              href={`/projects/${item.projectId}`}
              className="block truncate font-semibold text-ink hover:text-accent"
            >
              {item.name}
            </Link>
            <p className="truncate text-sm text-ink-muted">{item.artist || "Sem artista"}</p>
          </div>
          <button
            type="button"
            onClick={onToggleFavorite}
            className={cn(
              "rounded-lg p-1.5 transition-colors",
              isFavorite ? "text-accent" : "text-ink-faint hover:text-ink",
            )}
            aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            aria-pressed={isFavorite}
          >
            <Star className={cn("h-4 w-4", isFavorite && "fill-current")} />
          </button>
          <LibraryActionsMenu
            isFavorite={isFavorite}
            canStudio={canStudio}
            canExport={canExport}
            canReprocess={canReprocess}
            showCollect={showCollect}
            showSetlist={showSetlist}
            onOpenStudio={onOpenStudio}
            onPractice={onPractice}
            onReprocess={onReprocess}
            onExport={onExport}
            onRename={onRename}
            onToggleFavorite={onToggleFavorite}
            onDelete={onDelete}
            onCollect={onCollect}
            onAddToSetlist={onAddToSetlist}
          />
        </div>

        <dl className="text-data grid grid-cols-4 gap-2 text-xs text-ink-muted">
          <div>
            <dt className="sr-only">Duração</dt>
            <dd>{formatDuration(item.durationMs)}</dd>
          </div>
          <div>
            <dt className="sr-only">BPM</dt>
            <dd>{item.bpm ? `${item.bpm} BPM` : "— BPM"}</dd>
          </div>
          <div>
            <dt className="sr-only">Tom</dt>
            <dd>{item.musicalKey || "Tom —"}</dd>
          </div>
          <div>
            <dt className="sr-only">Faixas</dt>
            <dd>
              {item.stemCount} {item.stemCount === 1 ? "faixa" : "faixas"}
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line/60 pt-3 text-xs">
          {item.format ? (
            <span className="text-data rounded-md bg-white/[0.05] px-2 py-0.5 uppercase text-ink-muted">
              {item.format}
            </span>
          ) : null}
          <StatusPill status={item.processing} />
          <time className="text-data ml-auto text-ink-faint" dateTime={item.updatedAt}>
            {new Date(item.updatedAt).toLocaleDateString("pt-BR")}
          </time>
        </div>
      </div>
    </article>
  );
}
