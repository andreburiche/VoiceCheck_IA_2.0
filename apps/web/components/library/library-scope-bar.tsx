"use client";

import { FormEvent, useState } from "react";
import { FolderPlus, Heart, Layers3, Library, ListMusic, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LibraryCollection, LibrarySetlist } from "@/lib/library-local-db";
import { cn } from "@/lib/utils";

export type LibraryScope =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "with_stems" }
  | { type: "no_stems" }
  | { type: "collection"; id: string }
  | { type: "setlist"; id: string };

type LibraryScopeBarProps = {
  scope: LibraryScope;
  onScopeChange: (scope: LibraryScope) => void;
  collections: LibraryCollection[];
  setlists: LibrarySetlist[];
  counts: {
    all: number;
    favorites: number;
    withStems: number;
    noStems: number;
  };
  onCreateCollection: (name: string) => void;
  onDeleteCollection: (id: string) => void;
  onCreateSetlist: (name: string) => void;
  onDeleteSetlist: (id: string) => void;
};

export function LibraryScopeBar({
  scope,
  onScopeChange,
  collections,
  setlists,
  counts,
  onCreateCollection,
  onDeleteCollection,
  onCreateSetlist,
  onDeleteSetlist,
}: LibraryScopeBarProps) {
  const [creating, setCreating] = useState<"collection" | "setlist" | null>(null);
  const [name, setName] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !creating) return;
    if (creating === "collection") onCreateCollection(n);
    else onCreateSetlist(n);
    setName("");
    setCreating(null);
  }

  const smart = [
    { key: "all" as const, label: "Todas", icon: Library, count: counts.all },
    { key: "favorites" as const, label: "Favoritos", icon: Heart, count: counts.favorites },
    { key: "with_stems" as const, label: "Com faixas", icon: Layers3, count: counts.withStems },
    { key: "no_stems" as const, label: "Sem separação", icon: ListMusic, count: counts.noStems },
  ];

  return (
    <div className="panel-glass space-y-3 rounded-2xl p-4" role="region" aria-label="Escopos da biblioteca">
      <div className="flex flex-wrap items-center gap-2">
        <p className="hud-label mr-1">Catálogo</p>
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Filtros rápidos do catálogo"
        >
          {smart.map(({ key, label, icon: Icon, count }) => {
            const active = scope.type === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onScopeChange({ type: key })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-white/[0.08] bg-white/[0.02] text-ink-muted hover:border-accent/30 hover:text-ink",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {label}
                <span className="text-data text-xs text-ink-faint">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
        <p className="hud-label mr-1">Coleções e setlists</p>

        {collections.map((c) => {
          const active = scope.type === "collection" && scope.id === c.id;
          return (
            <span
              key={c.id}
              className={cn(
                "group inline-flex items-center gap-1 rounded-xl border pl-3 pr-1 py-1 text-sm",
                active
                  ? "border-violet/40 bg-violet/15 text-violet"
                  : "border-white/[0.08] bg-white/[0.02] text-ink-muted",
              )}
            >
              <button
                type="button"
                onClick={() => onScopeChange({ type: "collection", id: c.id })}
                className="max-w-[10rem] truncate hover:text-ink"
                aria-pressed={active}
              >
                {c.name}
                <span className="ml-1.5 text-data text-xs text-ink-faint">{c.projectIds.length}</span>
              </button>
              <button
                type="button"
                className="rounded-lg p-1 text-ink-faint opacity-60 hover:bg-canvas-overlay hover:text-signal-err group-hover:opacity-100"
                aria-label={`Excluir coleção ${c.name}`}
                onClick={() => onDeleteCollection(c.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}

        {setlists.map((s) => {
          const active = scope.type === "setlist" && scope.id === s.id;
          return (
            <span
              key={s.id}
              className={cn(
                "group inline-flex items-center gap-1 rounded-xl border pl-3 pr-1 py-1 text-sm",
                active
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/[0.08] bg-white/[0.02] text-ink-muted",
              )}
            >
              <button
                type="button"
                onClick={() => onScopeChange({ type: "setlist", id: s.id })}
                className="max-w-[10rem] truncate hover:text-ink"
                aria-pressed={active}
              >
                <ListMusic className="mr-1 inline h-3 w-3 opacity-70" aria-hidden />
                {s.name}
                <span className="ml-1.5 text-data text-xs text-ink-faint">{s.projectIds.length}</span>
              </button>
              <button
                type="button"
                className="rounded-lg p-1 text-ink-faint opacity-60 hover:bg-canvas-overlay hover:text-signal-err group-hover:opacity-100"
                aria-label={`Excluir setlist ${s.name}`}
                onClick={() => onDeleteSetlist(s.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}

        {collections.length === 0 && setlists.length === 0 && creating === null ? (
          <span className="text-xs text-ink-faint">Nenhuma ainda</span>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Nova coleção"
          onClick={() => {
            setCreating("collection");
            setName("");
          }}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Coleção
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Nova setlist"
          onClick={() => {
            setCreating("setlist");
            setName("");
          }}
        >
          <ListMusic className="h-3.5 w-3.5" />
          Setlist
        </Button>
      </div>

      {creating ? (
        <form
          onSubmit={submit}
          className="flex flex-wrap items-end gap-2 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]"
        >
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="library-scope-name" className="sr-only">
              Nome da {creating === "collection" ? "coleção" : "setlist"}
            </label>
            <Input
              id="library-scope-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={creating === "collection" ? "Nome da coleção" : "Nome do repertório"}
              autoFocus
            />
          </div>
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Criar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setCreating(null);
              setName("");
            }}
          >
            Cancelar
          </Button>
        </form>
      ) : null}
    </div>
  );
}
