"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Library } from "lucide-react";

import { LibraryCard } from "@/components/library/library-card";
import { LibraryFilters } from "@/components/library/library-filters";
import { LibraryScopeBar, type LibraryScope } from "@/components/library/library-scope-bar";
import { LibraryTable } from "@/components/library/library-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { assetsApi, projectsApi } from "@/lib/api";
import {
  buildCatalog,
  filterCatalog,
  sortCatalog,
  uniqueArtists,
  uniqueFormats,
  uniqueKeys,
  type LibraryCatalogItem,
  type LibraryFilterState,
} from "@/lib/library-catalog";
import {
  createCollectionId,
  createSetlistId,
  loadLibraryLocalState,
  saveLibraryLocalState,
  type LibraryCollection,
  type LibraryLocalState,
  type LibrarySetlist,
  type LibrarySortKey,
  type LibraryViewMode,
} from "@/lib/library-local-db";
import { CardGridSkeleton } from "@/components/ui/skeleton";
import { UndoToast } from "@/components/ui/undo-toast";
import { friendlyError } from "@/lib/errors";

export function LibraryWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const [local, setLocal] = useState<LibraryLocalState | null>(null);
  const [scope, setScope] = useState<LibraryScope>({ type: "all" });
  const [filters, setFilters] = useState<LibraryFilterState>({
    q: searchParams.get("q") ?? "",
    artist: "",
    format: "",
    key: "",
    processing: "all",
    date: "all",
  });
  const [deleteTarget, setDeleteTarget] = useState<LibraryCatalogItem | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [renameTarget, setRenameTarget] = useState<LibraryCatalogItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [collectTarget, setCollectTarget] = useState<LibraryCatalogItem | null>(null);
  const [setlistTarget, setSetlistTarget] = useState<LibraryCatalogItem | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  useEffect(() => {
    void loadLibraryLocalState().then(setLocal);
  }, []);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q != null) setFilters((f) => ({ ...f, q }));
  }, [searchParams]);

  const persist = useCallback(async (next: LibraryLocalState) => {
    setLocal(next);
    await saveLibraryLocalState(next);
  }, []);

  const projects = useQuery({ queryKey: ["projects"], queryFn: () => projectsApi.list() });
  const originals = useQuery({
    queryKey: ["assets", "original"],
    queryFn: () => assetsApi.list({ kind: "original" }),
  });
  const stems = useQuery({
    queryKey: ["assets", "stem"],
    queryFn: () => assetsApi.list({ kind: "stem" }),
  });

  const catalog = useMemo(
    () =>
      buildCatalog(
        projects.data?.items ?? [],
        originals.data?.items ?? [],
        stems.data?.items ?? [],
      ),
    [projects.data?.items, originals.data?.items, stems.data?.items],
  );

  const favoriteSet = useMemo(() => new Set(local?.favorites ?? []), [local?.favorites]);

  const scopeOpts = useMemo(() => {
    if (scope.type === "favorites") return { favoriteIds: favoriteSet };
    if (scope.type === "with_stems") {
      return {
        collectionIds: new Set(catalog.filter((i) => i.stemCount > 0).map((i) => i.projectId)),
      };
    }
    if (scope.type === "no_stems") {
      return {
        collectionIds: new Set(catalog.filter((i) => i.stemCount === 0).map((i) => i.projectId)),
      };
    }
    if (scope.type === "collection") {
      const col = local?.collections.find((c) => c.id === scope.id);
      return { collectionIds: new Set(col?.projectIds ?? []) };
    }
    if (scope.type === "setlist") {
      const sl = local?.setlists.find((s) => s.id === scope.id);
      return { collectionIds: new Set(sl?.projectIds ?? []) };
    }
    return {};
  }, [scope, favoriteSet, catalog, local?.collections, local?.setlists]);

  const visible = useMemo(() => {
    if (!local) return [];
    const filtered = filterCatalog(catalog, filters, scopeOpts);
    return sortCatalog(filtered, local.prefs.sortKey, local.prefs.sortDir);
  }, [catalog, filters, scopeOpts, local]);

  const counts = useMemo(
    () => ({
      all: catalog.length,
      favorites: catalog.filter((i) => favoriteSet.has(i.projectId)).length,
      withStems: catalog.filter((i) => i.stemCount > 0).length,
      noStems: catalog.filter((i) => i.stemCount === 0).length,
    }),
    [catalog, favoriteSet],
  );

  const remove = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: async (_data, id) => {
      setUndoTarget({ id, name: deleteTarget?.name ?? "Música" });
      setDeleteTarget(null);
      setConfirmText("");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: Error) => setActionErr(friendlyError(err, "Não foi possível excluir a música. Tente de novo.")),
  });
  const [undoTarget, setUndoTarget] = useState<{ id: string; name: string } | null>(null);

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => projectsApi.update(id, { name }),
    onSuccess: async () => {
      setRenameTarget(null);
      setRenameValue("");
      await qc.invalidateQueries({ queryKey: ["projects"] });
      setActionMsg("Projeto renomeado.");
    },
    onError: (err: Error) => setActionErr(err.message),
  });

  async function updatePrefs(patch: Partial<LibraryLocalState["prefs"]>) {
    if (!local) return;
    await persist({ ...local, prefs: { ...local.prefs, ...patch } });
  }

  async function toggleFavorite(projectId: string) {
    if (!local) return;
    const has = local.favorites.includes(projectId);
    const favorites = has
      ? local.favorites.filter((id) => id !== projectId)
      : [...local.favorites, projectId];
    await persist({ ...local, favorites });
  }

  async function createCollection(name: string) {
    if (!local) return;
    const collection: LibraryCollection = {
      id: createCollectionId(),
      name,
      projectIds: [],
      createdAt: new Date().toISOString(),
    };
    await persist({ ...local, collections: [...local.collections, collection] });
  }

  async function deleteCollection(id: string) {
    if (!local) return;
    await persist({
      ...local,
      collections: local.collections.filter((c) => c.id !== id),
    });
    if (scope.type === "collection" && scope.id === id) setScope({ type: "all" });
  }

  async function createSetlist(name: string) {
    if (!local) return;
    const now = new Date().toISOString();
    const setlist: LibrarySetlist = {
      id: createSetlistId(),
      name,
      projectIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await persist({ ...local, setlists: [...(local.setlists ?? []), setlist] });
  }

  async function deleteSetlist(id: string) {
    if (!local) return;
    await persist({
      ...local,
      setlists: (local.setlists ?? []).filter((s) => s.id !== id),
    });
    if (scope.type === "setlist" && scope.id === id) setScope({ type: "all" });
  }

  async function addToCollection(projectId: string, collectionId: string) {
    if (!local) return;
    const collections = local.collections.map((c) => {
      if (c.id !== collectionId) return c;
      if (c.projectIds.includes(projectId)) return c;
      return { ...c, projectIds: [...c.projectIds, projectId] };
    });
    await persist({ ...local, collections });
    setCollectTarget(null);
    setActionMsg("Adicionado à coleção.");
  }

  async function addToSetlist(projectId: string, setlistId: string) {
    if (!local) return;
    const setlists = (local.setlists ?? []).map((s) => {
      if (s.id !== setlistId) return s;
      if (s.projectIds.includes(projectId)) return s;
      return {
        ...s,
        projectIds: [...s.projectIds, projectId],
        updatedAt: new Date().toISOString(),
      };
    });
    await persist({ ...local, setlists });
    setSetlistTarget(null);
    setActionMsg("Adicionado à setlist.");
  }

  function openStudio(id: string) {
    router.push(`/projects/${id}/studio`);
  }
  function practice(id: string) {
    router.push(`/projects/${id}/practice`);
  }
  function reprocess(id: string) {
    router.push(`/projects/${id}#separacao`);
  }

  function exportProject(id: string) {
    router.push(`/projects/${id}/export`);
  }

  const itemHandlers = {
    onOpenStudio: openStudio,
    onPractice: practice,
    onReprocess: reprocess,
    onExport: exportProject,
    onRename: (item: LibraryCatalogItem) => {
      setRenameTarget(item);
      setRenameValue(item.name);
    },
    onToggleFavorite: (id: string) => void toggleFavorite(id),
    onDelete: (item: LibraryCatalogItem) => {
      setDeleteTarget(item);
      setConfirmText("");
    },
    onCollect: (item: LibraryCatalogItem) => setCollectTarget(item),
    onAddToSetlist: (item: LibraryCatalogItem) => setSetlistTarget(item),
  };

  const loading = projects.isLoading || originals.isLoading || stems.isLoading || !local;
  const hasCollections = (local?.collections.length ?? 0) > 0;
  const hasSetlists = (local?.setlists?.length ?? 0) > 0;

  return (
    <div className="page-shell space-y-6">
      <header className="space-y-5">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Biblioteca</h1>
          <p className="mt-2 text-base text-ink-muted">
            Todas as suas músicas
            {!loading ? ` · ${visible.length} exibido${visible.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumo da biblioteca">
          {[
            { label: "Músicas", value: counts.all, tone: "text-ink" },
            { label: "Com faixas", value: counts.withStems, tone: "text-accent" },
            { label: "Sem separação", value: counts.noStems, tone: counts.noStems > 0 ? "text-flare-soft" : "text-ink" },
            { label: "Favoritas", value: counts.favorites, tone: "text-ink" },
          ].map((s) => (
            <div key={s.label} className="panel-glass rounded-xl px-4 py-3">
              <dt className="hud-label">{s.label}</dt>
              <dd className={`text-data mt-1 text-2xl font-semibold ${s.tone}`}>{loading ? "—" : s.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <LibraryScopeBar
        scope={scope}
        onScopeChange={setScope}
        collections={local?.collections ?? []}
        setlists={local?.setlists ?? []}
        counts={counts}
        onCreateCollection={(n) => void createCollection(n)}
        onDeleteCollection={(id) => void deleteCollection(id)}
        onCreateSetlist={(n) => void createSetlist(n)}
        onDeleteSetlist={(id) => void deleteSetlist(id)}
      />

      {local ? (
        <LibraryFilters
          filters={filters}
          onChange={setFilters}
          artists={uniqueArtists(catalog)}
          formats={uniqueFormats(catalog)}
          keys={uniqueKeys(catalog)}
          viewMode={local.prefs.viewMode}
          onViewMode={(mode: LibraryViewMode) => void updatePrefs({ viewMode: mode })}
          sortKey={local.prefs.sortKey}
          sortDir={local.prefs.sortDir}
          onSortKey={(key: LibrarySortKey) => void updatePrefs({ sortKey: key })}
          onSortDir={(dir) => void updatePrefs({ sortDir: dir })}
        />
      ) : null}

        {actionMsg ? (
          <p
            role="status"
            className="rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent ring-1 ring-accent/25"
          >
            {actionMsg}
          </p>
        ) : null}
        {actionErr ? (
          <p
            role="alert"
            className="rounded-xl border border-signal-err/40 bg-signal-err/10 px-3 py-2 text-sm text-signal-err"
          >
            {actionErr}
          </p>
        ) : null}

        {loading ? <CardGridSkeleton label="Carregando biblioteca…" /> : null}

        {projects.isError ? (
          <p role="alert" className="text-sm text-signal-err">
            {friendlyError(projects.error)}
          </p>
        ) : null}

        {!loading && catalog.length === 0 ? (
          <EmptyState
            icon={Library}
            title="Biblioteca vazia"
            description="Crie um projeto e importe uma música para montar seu catálogo visual."
            actionHref="/projects?new=1"
            actionLabel="Criar projeto"
          />
        ) : null}

        {!loading && catalog.length > 0 && visible.length === 0 ? (
          <EmptyState
            icon={Library}
            title="Nenhum resultado"
            description="Ajuste busca, filtros ou a coleção selecionada."
            actionHref="/library"
            actionLabel="Limpar busca da URL"
          />
        ) : null}

        {!loading && visible.length > 0 && local?.prefs.viewMode === "cards" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((item) => (
              <LibraryCard
                key={item.projectId}
                item={item}
                isFavorite={favoriteSet.has(item.projectId)}
                showCollect={hasCollections}
                showSetlist={hasSetlists}
                onOpenStudio={() => itemHandlers.onOpenStudio(item.projectId)}
                onPractice={() => itemHandlers.onPractice(item.projectId)}
                onReprocess={() => itemHandlers.onReprocess(item.projectId)}
                onExport={() => itemHandlers.onExport(item.projectId)}
                onRename={() => itemHandlers.onRename(item)}
                onToggleFavorite={() => itemHandlers.onToggleFavorite(item.projectId)}
                onDelete={() => itemHandlers.onDelete(item)}
                onCollect={() => itemHandlers.onCollect(item)}
                onAddToSetlist={() => itemHandlers.onAddToSetlist(item)}
              />
            ))}
          </div>
        ) : null}

        {!loading && visible.length > 0 && local?.prefs.viewMode === "table" ? (
          <LibraryTable
            items={visible}
            favorites={favoriteSet}
            showCollect={hasCollections}
            showSetlist={hasSetlists}
            onOpenStudio={itemHandlers.onOpenStudio}
            onPractice={itemHandlers.onPractice}
            onReprocess={itemHandlers.onReprocess}
            onExport={itemHandlers.onExport}
            onRename={itemHandlers.onRename}
            onToggleFavorite={itemHandlers.onToggleFavorite}
            onDelete={itemHandlers.onDelete}
            onCollect={itemHandlers.onCollect}
            onAddToSetlist={itemHandlers.onAddToSetlist}
          />
        ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? `Excluir “${deleteTarget.name}”?` : "Excluir música?"}
        description={
          deleteTarget
            ? `“${deleteTarget.name}” sai da sua lista de músicas.`
            : ""
        }
        confirmValue={confirmText}
        onConfirmValueChange={setConfirmText}
        confirmLabel="Excluir música"
        danger
        busy={remove.isPending}
        onCancel={() => {
          setDeleteTarget(null);
          setConfirmText("");
        }}
        onConfirm={() => {
          if (deleteTarget) remove.mutate(deleteTarget.projectId);
        }}
      />

      {renameTarget ? (
        <Modal onClose={() => setRenameTarget(null)} labelledBy="rename-title" className="space-y-4">
            <h2 id="rename-title" className="text-lg font-semibold text-ink">
              Renomear música
            </h2>
            <div className="space-y-2">
              <Label htmlFor="rename-input">Nome</Label>
              <Input
                id="rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setRenameTarget(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!renameValue.trim() || rename.isPending}
                onClick={() =>
                  rename.mutate({ id: renameTarget.projectId, name: renameValue.trim() })
                }
              >
                Salvar
              </Button>
            </div>
        </Modal>
      ) : null}

      {collectTarget && local ? (
        <Modal onClose={() => setCollectTarget(null)} labelledBy="collect-title" className="max-w-sm space-y-3">
            <h2 id="collect-title" className="text-lg font-semibold text-ink">
              Adicionar a coleção
            </h2>
            <p className="text-sm text-ink-muted">{collectTarget.name}</p>
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {local.collections.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.04] hover:ring-accent/40"
                    onClick={() => void addToCollection(collectTarget.projectId, c.id)}
                  >
                    {c.name}
                    <span className="text-data ml-2 text-xs text-ink-faint">{c.projectIds.length}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setCollectTarget(null)}>
              Cancelar
            </Button>
        </Modal>
      ) : null}

      {setlistTarget && local ? (
        <Modal onClose={() => setSetlistTarget(null)} labelledBy="setlist-title" className="max-w-sm space-y-3">
            <h2 id="setlist-title" className="text-lg font-semibold text-ink">
              Adicionar à setlist
            </h2>
            <p className="text-sm text-ink-muted">{setlistTarget.name}</p>
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {(local.setlists ?? []).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.04] hover:ring-accent/40"
                    onClick={() => void addToSetlist(setlistTarget.projectId, s.id)}
                  >
                    {s.name}
                    <span className="text-data ml-2 text-xs text-ink-faint">{s.projectIds.length}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setSetlistTarget(null)}>
              Cancelar
            </Button>
        </Modal>
      ) : null}
      {undoTarget ? (
        <UndoToast
          message={`“${undoTarget.name}” foi excluída.`}
          onUndo={async () => {
            await projectsApi.restore(undoTarget.id);
            await qc.invalidateQueries({ queryKey: ["projects"] });
          }}
          onClose={() => setUndoTarget(null)}
        />
      ) : null}
    </div>
  );
}
