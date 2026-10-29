"use client";

import { LayoutGrid, List, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LibraryFilterState, ProcessingFilter } from "@/lib/library-catalog";
import type { LibrarySortKey, LibraryViewMode } from "@/lib/library-local-db";
import { cn } from "@/lib/utils";

type LibraryFiltersProps = {
  filters: LibraryFilterState;
  onChange: (next: LibraryFilterState) => void;
  artists: string[];
  formats: string[];
  keys: string[];
  viewMode: LibraryViewMode;
  onViewMode: (mode: LibraryViewMode) => void;
  sortKey: LibrarySortKey;
  sortDir: "asc" | "desc";
  onSortKey: (key: LibrarySortKey) => void;
  onSortDir: (dir: "asc" | "desc") => void;
};

export function LibraryFilters({
  filters,
  onChange,
  artists,
  formats,
  keys,
  viewMode,
  onViewMode,
  sortKey,
  sortDir,
  onSortKey,
  onSortDir,
}: LibraryFiltersProps) {
  function patch<K extends keyof LibraryFilterState>(key: K, value: LibraryFilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  const selectClass =
    "h-10 rounded-lg border border-line bg-canvas-raised px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <Input
            type="search"
            value={filters.q}
            onChange={(e) => patch("q", e.target.value)}
            placeholder="Buscar por nome ou artista…"
            className="pl-9"
            aria-label="Buscar na biblioteca"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="panel-glass inline-flex rounded-xl p-0.5" role="group" aria-label="Visualização">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "cards" ? "default" : "ghost"}
              aria-pressed={viewMode === "cards"}
              onClick={() => onViewMode("cards")}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Cards</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "table" ? "default" : "ghost"}
              aria-pressed={viewMode === "table"}
              onClick={() => onViewMode("table")}
            >
              <List className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Tabela</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="lib-artist">
          Artista
        </label>
        <select
          id="lib-artist"
          className={cn(selectClass, "min-w-[8rem]")}
          value={filters.artist}
          onChange={(e) => patch("artist", e.target.value)}
        >
          <option value="">Artista</option>
          {artists.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="lib-format">
          Formato
        </label>
        <select
          id="lib-format"
          className={selectClass}
          value={filters.format}
          onChange={(e) => patch("format", e.target.value)}
        >
          <option value="">Formato</option>
          {formats.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="lib-date">
          Data
        </label>
        <select
          id="lib-date"
          className={selectClass}
          value={filters.date}
          onChange={(e) => patch("date", e.target.value as LibraryFilterState["date"])}
        >
          <option value="all">Qualquer data</option>
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="365d">Último ano</option>
        </select>

        <label className="sr-only" htmlFor="lib-key">
          Tonalidade
        </label>
        <select
          id="lib-key"
          className={selectClass}
          value={filters.key}
          onChange={(e) => patch("key", e.target.value)}
        >
          <option value="">Tonalidade</option>
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="lib-processing">
          Processamento
        </label>
        <select
          id="lib-processing"
          className={selectClass}
          value={filters.processing}
          onChange={(e) => patch("processing", e.target.value as ProcessingFilter)}
        >
          <option value="all">Processamento</option>
          <option value="ready">Com faixas</option>
          <option value="none">Sem separação</option>
          <option value="pending">Em andamento</option>
          <option value="failed">Falhou</option>
        </select>

        <label className="sr-only" htmlFor="lib-sort">
          Ordenar
        </label>
        <select
          id="lib-sort"
          className={selectClass}
          value={sortKey}
          onChange={(e) => onSortKey(e.target.value as LibrarySortKey)}
        >
          <option value="updated">Última edição</option>
          <option value="name">Nome</option>
          <option value="artist">Artista</option>
          <option value="duration">Duração</option>
          <option value="bpm">BPM</option>
        </select>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-10"
          onClick={() => onSortDir(sortDir === "asc" ? "desc" : "asc")}
          aria-label={sortDir === "asc" ? "Ordem crescente" : "Ordem decrescente"}
        >
          {sortDir === "asc" ? "A→Z" : "Z→A"}
        </Button>
      </div>
    </div>
  );
}
