"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Search } from "lucide-react";

import { ProjectRowCard } from "@/components/projects/project-row-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Label } from "@/components/ui/label";
import { projectsApi, type Project } from "@/lib/api";
import { peekPendingLabMidi } from "@/lib/voicecheck-lab-bridge";
import Link from "next/link";
import { CardGridSkeleton, PageSkeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";
import { UndoToast } from "@/components/ui/undo-toast";

export default function ProjectsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Carregando músicas…" />}>
      <ProjectsContent />
    </Suspense>
  );
}

type SortKey = "updated" | "name-asc" | "name-desc";

function ProjectsContent() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusNew = searchParams.get("new") === "1";
  const nameRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: () => projectsApi.list(),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [pendingLab, setPendingLab] = useState<ReturnType<typeof peekPendingLabMidi>>(null);

  useEffect(() => {
    if (focusNew) nameRef.current?.focus();
  }, [focusNew]);

  useEffect(() => {
    setPendingLab(peekPendingLabMidi());
  }, []);

  const create = useMutation({
    mutationFn: () => projectsApi.create({ name, description: description || undefined }),
    onSuccess: (created) => {
      setName("");
      setDescription("");
      setFormError(null);
      void qc.invalidateQueries({ queryKey: ["projects"] });
      // Criar sem áudio não serve para nada: leva direto à importação da nova música
      if (created?.id) router.push(`/projects/${created.id}#importar`);
    },
    onError: (err: Error & { status?: number }) => {
      if (err.status === 401) {
        setFormError("Sessão expirada — faça login novamente.");
        return;
      }
      setFormError(friendlyError(err, "Não foi possível criar a música. Tente de novo."));
    },
  });

  const update = useMutation({
    mutationFn: () =>
      projectsApi.update(editTarget!.id, {
        name: editName.trim(),
        description: editDescription.trim(),
      }),
    onSuccess: () => {
      setEditTarget(null);
      setEditError(null);
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: Error) => setEditError(err.message),
  });

  const remove = useMutation({
    mutationFn: () => projectsApi.remove(deleteTarget!.id),
    onSuccess: () => {
      if (deleteTarget) setUndoTarget({ id: deleteTarget.id, name: deleteTarget.name });
      setDeleteTarget(null);
      setConfirmText("");
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const [undoTarget, setUndoTarget] = useState<{ id: string; name: string } | null>(null);

  const visible = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description ?? "").toLowerCase().includes(q),
        )
      : items;

    const sorted = [...filtered];
    if (sortKey === "name-asc") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    } else if (sortKey === "name-desc") {
      sorted.sort((a, b) => b.name.localeCompare(a.name, "pt-BR"));
    } else {
      sorted.sort((a, b) => {
        const ta = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
        const tb = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
        return tb - ta;
      });
    }
    return sorted;
  }, [data?.items, query, sortKey]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Informe o nome da música.");
      return;
    }
    create.mutate();
  }

  function openEdit(p: Project) {
    setEditTarget(p);
    setEditName(p.name);
    setEditDescription(p.description ?? "");
    setEditError(null);
  }

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Minhas músicas</h1>
          <p className="mt-2 text-base text-ink-muted">
            Suas músicas para separar, treinar e analisar{!isLoading && data ? ` · ${data.items.length} no total` : ""}.
          </p>
        </div>
      </div>

      {pendingLab ? (
        <div className="panel-glass rounded-2xl px-4 py-3 text-sm text-ink">
          <p className="flex items-center gap-2 font-medium text-ink">
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden />
            Referência do diagnóstico vocal pronta
          </p>
          <p className="mt-1 text-ink-muted">
            {pendingLab.title} · {pendingLab.notes.length} notas. Abra o Laboratório de Vozes de
            uma música para corrigir a partitura.
          </p>
          {data?.items?.[0] ? (
            <Link
              href={`/projects/${data.items[0].id}/vocal-lab`}
              className="mt-2 inline-block text-sm text-accent underline-offset-2 hover:underline"
            >
              Abrir na música mais recente
            </Link>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="panel-glass space-y-4 rounded-2xl p-5"
      >
        <h2 className="font-display text-lg font-semibold text-ink">Nova música</h2>
        {/* Em telas largas: nome, artista e botão na mesma linha */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              ref={nameRef}
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Ensaio — faixa principal"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Artista / notas (opcional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Artista ou descrição curta"
            />
          </div>
          <Button type="submit" disabled={create.isPending} className="justify-self-start">
            {create.isPending ? "Criando…" : "Criar e importar áudio"}
          </Button>
        </div>
        {formError ? (
          <p role="alert" className="text-sm text-signal-err">
            {formError}
          </p>
        ) : null}
      </form>

      <section className="space-y-4" aria-labelledby="projects-list-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="projects-list-title" className="font-display text-lg font-semibold text-ink">
              Todas as músicas
            </h2>
            <p className="text-data text-sm text-ink-muted">
              {!isLoading ? `${visible.length} de ${data?.items.length ?? 0}` : "…"}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-[12rem] flex-1 sm:w-64 sm:flex-none">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar por nome ou artista…"
                className="pl-9"
                aria-label="Filtrar músicas"
              />
            </div>
            <Label htmlFor="project-sort" className="sr-only">
              Ordenar
            </Label>
            <select
              id="project-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="h-10 rounded-xl border border-white/[0.08] bg-canvas-raised px-3 text-sm text-ink"
            >
              <option value="updated">Mais recentes</option>
              <option value="name-asc">Nome A–Z</option>
              <option value="name-desc">Nome Z–A</option>
            </select>
          </div>
        </div>

        {isLoading ? <CardGridSkeleton label="Carregando músicas…" /> : null}
        {isError ? (
          <p role="alert" className="text-sm text-signal-err">
            {friendlyError(error)}
          </p>
        ) : null}

        {!isLoading && (data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="Nenhuma música ainda"
            description="Dê um nome no formulário acima e importe o áudio da primeira música."
          />
        ) : null}

        {!isLoading && (data?.items.length ?? 0) > 0 && visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhum resultado"
            description="Ajuste o filtro de busca ou limpe o campo."
          />
        ) : null}

        {visible.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((p) => (
              <li key={p.id} className="min-w-0">
                <ProjectRowCard
                  project={p}
                  onEdit={() => openEdit(p)}
                  onDelete={() => {
                    setDeleteTarget(p);
                    setConfirmText("");
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {editTarget ? (
        <Modal onClose={() => setEditTarget(null)} labelledBy="edit-project-title" className="space-y-4">
            <h2 id="edit-project-title" className="font-display text-lg font-semibold text-ink">
              Editar música
            </h2>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Artista / notas</Label>
              <Input
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            {editError ? (
              <p role="alert" className="text-sm text-signal-err">
                {editError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={update.isPending || !editName.trim()}
                onClick={() => update.mutate()}
              >
                {update.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
        </Modal>
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
        onConfirm={() => remove.mutate()}
      />
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
