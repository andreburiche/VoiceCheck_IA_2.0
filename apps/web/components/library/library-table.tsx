"use client";

import Link from "next/link";
import { Star } from "lucide-react";

import { CoverArt } from "@/components/library/cover-art";
import { LibraryActionsMenu } from "@/components/library/library-actions-menu";
import type { LibraryCatalogItem } from "@/lib/library-catalog";
import { formatDuration, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

type LibraryTableProps = {
  items: LibraryCatalogItem[];
  favorites: Set<string>;
  showCollect?: boolean;
  showSetlist?: boolean;
  onOpenStudio: (id: string) => void;
  onPractice: (id: string) => void;
  onReprocess: (id: string) => void;
  onExport: (id: string) => void;
  onRename: (item: LibraryCatalogItem) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (item: LibraryCatalogItem) => void;
  onCollect?: (item: LibraryCatalogItem) => void;
  onAddToSetlist?: (item: LibraryCatalogItem) => void;
};

export function LibraryTable({
  items,
  favorites,
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
}: LibraryTableProps) {
  return (
    <div className="panel-glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="hud-label border-b border-white/[0.06]">
          <tr>
            <th className="px-3 py-3 font-medium">Projeto</th>
            <th className="px-3 py-3 font-medium">Duração</th>
            <th className="px-3 py-3 font-medium">BPM</th>
            <th className="px-3 py-3 font-medium">Tom</th>
            <th className="px-3 py-3 font-medium">Stems</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Edição</th>
            <th className="px-3 py-3 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {items.map((item) => {
            const fav = favorites.has(item.projectId);
            return (
              <tr key={item.projectId} className="transition-colors hover:bg-white/[0.03]">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <CoverArt seed={item.projectId} title={item.name} className="h-9 w-9 text-xs" />
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${item.projectId}`}
                        className="block truncate font-medium text-ink hover:text-accent"
                      >
                        {item.name}
                      </Link>
                      <p className="truncate text-xs text-ink-muted">
                        {item.artist || "Sem artista"}
                        {item.format ? ` · ${item.format.toUpperCase()}` : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="text-data px-3 py-3 text-ink-muted">{formatDuration(item.durationMs)}</td>
                <td className="text-data px-3 py-3 text-ink-muted">{item.bpm ?? "—"}</td>
                <td className="text-data px-3 py-3 text-ink-muted">{item.musicalKey ?? "—"}</td>
                <td className="text-data px-3 py-3 text-ink">{item.stemCount}</td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      item.processing === "ready"
                        ? "bg-accent/10 text-accent"
                        : item.processing === "pending"
                          ? "bg-flare/15 text-flare-soft"
                          : item.processing === "failed"
                            ? "bg-red-500/15 text-red-300"
                            : "bg-white/[0.05] text-ink-muted",
                    )}
                  >
                    {statusLabel(item.processing)}
                  </span>
                </td>
                <td className="text-data px-3 py-3 text-xs text-ink-faint">
                  <time dateTime={item.updatedAt}>
                    {new Date(item.updatedAt).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(item.projectId)}
                      className={cn(
                        "rounded-lg p-1.5",
                        fav ? "text-accent" : "text-ink-faint hover:text-ink",
                      )}
                      aria-label={fav ? "Remover dos favoritos" : "Favoritar"}
                      aria-pressed={fav}
                    >
                      <Star className={cn("h-4 w-4", fav && "fill-current")} />
                    </button>
                    <LibraryActionsMenu
                      isFavorite={fav}
                      canStudio={item.stemCount > 0}
                      canExport={item.stemCount > 0}
                      canReprocess={item.hasOriginal}
                      showCollect={showCollect}
                      showSetlist={showSetlist}
                      onOpenStudio={() => onOpenStudio(item.projectId)}
                      onPractice={() => onPractice(item.projectId)}
                      onReprocess={() => onReprocess(item.projectId)}
                      onExport={() => onExport(item.projectId)}
                      onRename={() => onRename(item)}
                      onToggleFavorite={() => onToggleFavorite(item.projectId)}
                      onDelete={() => onDelete(item)}
                      onCollect={onCollect ? () => onCollect(item) : undefined}
                      onAddToSetlist={onAddToSetlist ? () => onAddToSetlist(item) : undefined}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
