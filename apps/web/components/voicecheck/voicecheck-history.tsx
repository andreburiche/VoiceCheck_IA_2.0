"use client";

import {
  Check,
  ChevronDown,
  Cloud,
  CloudDownload,
  CloudOff,
  FolderOpen,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { VoiceCheckProjectListItem } from "@/lib/voicecheck-store";
import { friendlyError } from "@/lib/errors";

const COLLAPSED = 5;

type Stage = { label: string; tone: "done" | "mid" | "start" };

function stageOf(p: VoiceCheckProjectListItem): Stage {
  if (p.hasReport || p.summary) return { label: "Analisado", tone: "done" };
  if (p.hasPreparedWav) return { label: "Áudio preparado", tone: "mid" };
  return { label: "Importado", tone: "start" };
}

type SyncBadge = { label: string; title: string; tone: "ok" | "busy" | "remote" | "warn"; Icon: typeof Cloud };

function syncOf(p: VoiceCheckProjectListItem, serverOnline: boolean | null): SyncBadge {
  if (p.syncing) {
    return { label: "Enviando…", title: "Enviando para a sua conta", tone: "busy", Icon: LoaderCircle };
  }
  if (p.location === "server") {
    return {
      label: "Na conta",
      title: "Salvo na sua conta. Ao abrir, o áudio é baixado para este navegador.",
      tone: "remote",
      Icon: CloudDownload,
    };
  }
  if (p.location === "both" && !p.sync?.error) {
    return {
      label: p.stale ? "Atualizar" : "Na conta",
      title: p.stale
        ? "Há uma versão mais nova na sua conta; ela será baixada ao abrir."
        : "Salvo na sua conta e neste navegador.",
      tone: "ok",
      Icon: Cloud,
    };
  }
  const reason =
    p.sync?.error ??
    (serverOnline === false ? "Servidor indisponível agora." : "Ainda não enviado para a sua conta.");
  return { label: "Só aqui", title: reason, tone: "warn", Icon: CloudOff };
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

/**
 * Registro dos diagnósticos VoiceCheck salvos neste navegador (IndexedDB).
 * Cada item pode ser reaberto, renomeado ou excluído.
 */
export function VoiceCheckHistory({
  items,
  serverOnline,
  activeId,
  openingId,
  savedAt,
  onOpen,
  onRename,
  onDelete,
  onNew,
}: {
  items: VoiceCheckProjectListItem[];
  /** null = ainda verificando; false = API fora do ar. */
  serverOnline: boolean | null;
  activeId: string | null;
  openingId: string | null;
  /** Hora do último salvamento automático do diagnóstico aberto. */
  savedAt: string | null;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  // Com um diagnóstico aberto, a lista recolhe para dar espaço à análise.
  const [listOpen, setListOpen] = useState(!activeId);
  useEffect(() => {
    setListOpen(!activeId);
  }, [activeId]);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<VoiceCheckProjectListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.asset?.name ?? "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const visible = expanded || query ? filtered : filtered.slice(0, COLLAPSED);

  function startRename(p: VoiceCheckProjectListItem) {
    setEditingId(p.id);
    setDraft(p.title);
    setRenameError(null);
  }

  async function commitRename(id: string) {
    const title = draft.trim();
    if (!title) {
      setRenameError("Informe um nome.");
      return;
    }
    try {
      await onRename(id, title);
      setEditingId(null);
    } catch (e) {
      setRenameError(friendlyError(e, "Não foi possível renomear."));
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await onDelete(toDelete.id);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className={cn("panel-glass rounded-2xl", listOpen ? "p-4 md:p-5" : "px-4 py-3 md:px-5")} aria-labelledby="vc-history-title">
      <div className={cn("flex flex-wrap justify-between gap-3", listOpen ? "items-start" : "items-center")}>
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
            aria-controls="vc-history-body"
            className="group flex items-center gap-2 text-left"
          >
            <h2
              id="vc-history-title"
              className={cn("font-display font-semibold text-ink", listOpen ? "mt-1 text-xl" : "text-base")}
            >
              Meus diagnósticos
            </h2>
            <span className="text-data rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-xs text-ink-muted">
              {items.length}
            </span>
            <ChevronDown
              className={cn("h-4 w-4 text-ink-faint transition-transform group-hover:text-ink", listOpen && "rotate-180")}
              aria-hidden
            />
            <span className="sr-only">{listOpen ? "Recolher lista" : "Mostrar lista"}</span>
          </button>
          {listOpen ? (
            <p className="mt-1 text-sm text-ink-muted">
              Cada importação fica salva na sua conta — abra em qualquer computador para revisar os
              resultados, editar a devolutiva ou refazer uma etapa.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {savedAt && activeId ? (
            <span className="text-data hidden text-xs text-ink-faint sm:inline" role="status">
              Salvo às {savedAt}
            </span>
          ) : null}
          <Button type="button" size="sm" onClick={onNew}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Novo diagnóstico
          </Button>
        </div>
      </div>

      <div id="vc-history-body" hidden={!listOpen}>
      {serverOnline === false ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-flare/10 px-3 py-2 text-xs text-flare-soft ring-1 ring-inset ring-flare/25" role="status">
          <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Servidor indisponível: mostrando só o que está neste navegador. O que você salvar agora é
          enviado para a sua conta quando a API voltar.
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink/15 px-4 py-4 text-sm text-ink-muted">
          Nenhum diagnóstico ainda. Importe um áudio ou vídeo abaixo — ele entra aqui e na sua conta
          automaticamente.
        </p>
      ) : (
        <>
          {items.length > COLLAPSED ? (
            <div className="relative mt-4">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <label htmlFor="vc-history-search" className="sr-only">
                Buscar diagnóstico
              </label>
              <Input
                id="vc-history-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome ou arquivo"
                className="pl-9"
                autoComplete="off"
              />
            </div>
          ) : null}

          <ul className="mt-4 divide-y divide-ink/[0.07] overflow-hidden rounded-xl ring-1 ring-inset ring-ink/10">
            {visible.map((p) => {
              const stage = stageOf(p);
              const active = p.id === activeId;
              const dur = formatDuration(p.asset?.durationSec);
              const sync = syncOf(p, serverOnline);
              return (
                <li
                  key={p.id}
                  className={cn(
                    "flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4",
                    active ? "bg-accent/[0.06]" : "bg-canvas-raised/40",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    {editingId === p.id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void commitRename(p.id);
                        }}
                      >
                        <label htmlFor={`vc-rename-${p.id}`} className="sr-only">
                          Novo nome
                        </label>
                        <Input
                          id={`vc-rename-${p.id}`}
                          value={draft}
                          onChange={(e) => {
                            setDraft(e.target.value);
                            setRenameError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          maxLength={120}
                          className="h-9"
                          autoFocus
                          autoComplete="off"
                        />
                        <Button type="submit" size="sm" aria-label="Salvar nome">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Cancelar"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </form>
                    ) : (
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                        <span className="truncate" title={p.title}>
                          {p.title}
                        </span>
                        {active ? (
                          <span className="text-data shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
                            aberto
                          </span>
                        ) : null}
                      </p>
                    )}
                    {editingId === p.id && renameError ? (
                      <p role="alert" className="mt-1 text-xs text-signal-err">
                        {renameError}
                      </p>
                    ) : null}
                    <p className="text-data mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
                      <span>{formatWhen(p.updatedAt)}</span>
                      {dur ? <span>{dur}</span> : null}
                      {p.asset?.ext ? <span className="uppercase">{p.asset.ext}</span> : null}
                      {p.summary ? (
                        <span className={p.summary.events > 0 ? "text-flare-soft" : undefined}>
                          {p.summary.events} {p.summary.events === 1 ? "ocorrência" : "ocorrências"}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs",
                        sync.tone === "ok" && "text-ink-muted",
                        sync.tone === "remote" && "text-sky-300",
                        sync.tone === "busy" && "text-accent",
                        sync.tone === "warn" && "text-flare-soft",
                      )}
                      title={sync.title}
                    >
                      <sync.Icon
                        className={cn("h-3.5 w-3.5", sync.tone === "busy" && "animate-spin motion-reduce:animate-none")}
                        aria-hidden
                      />
                      {sync.label}
                      <span className="sr-only">: {sync.title}</span>
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        stage.tone === "done" && "bg-accent/10 text-accent",
                        stage.tone === "mid" && "bg-brand-blue/15 text-sky-300",
                        stage.tone === "start" && "bg-white/[0.05] text-ink-muted",
                      )}
                    >
                      {stage.label}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={active ? "secondary" : "default"}
                      disabled={openingId === p.id}
                      onClick={() => onOpen(p.id)}
                    >
                      <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                      {openingId === p.id ? "Abrindo…" : active ? "Reabrir" : "Abrir"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Renomear ${p.title}`}
                      title="Renomear"
                      onClick={() => startRename(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="hover:text-signal-err"
                      aria-label={`Excluir ${p.title}`}
                      title="Excluir"
                      onClick={() => setToDelete(p)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {query && filtered.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Nenhum diagnóstico com “{query}”.{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setQuery("")}>
                Limpar busca
              </button>
            </p>
          ) : null}

          {!query && filtered.length > COLLAPSED ? (
            <button
              type="button"
              className="mt-3 text-sm text-accent hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Mostrar menos" : `Mostrar todos (${filtered.length})`}
            </button>
          ) : null}
        </>
      )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title={`Excluir “${toDelete?.title ?? ""}”?`}
        description="O áudio importado, o WAV preparado e o resultado deste diagnóstico serão apagados da sua conta e deste navegador. O gráfico de evolução e as devolutivas já geradas continuam guardados."
        confirmLabel="Excluir diagnóstico"
        danger
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
