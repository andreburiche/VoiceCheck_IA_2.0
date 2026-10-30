"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Cpu, CircuitBoard, HardDrive } from "lucide-react";
import { useState } from "react";

import { ModelCard } from "@/components/models/model-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  STEM_DIFF_PANEL,
  groupModels,
  verifyModelIntegrity,
  type ModelBucket,
} from "@/lib/ai-models";
import { systemApi } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { CardGridSkeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";

type DialogKind = "import" | "update" | "remove" | null;

const SECTION: { id: ModelBucket; title: string; hint: string }[] = [
  {
    id: "installed",
    title: "Instalados",
    hint: "Instalados e prontos para separar faixas.",
  },
  {
    id: "available",
    title: "Disponíveis em pacote",
    hint: "No catálogo, mas sem registro habilitado. Sem download automático pela UI.",
  },
  {
    id: "incompatible",
    title: "Incompatíveis",
    hint: "Instalados no banco, porém não selecionáveis neste hardware/adapter.",
  },
];

export function ModelsWorkspace() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["system-status"],
    queryFn: () => systemApi.status(),
  });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [integrityLog, setIntegrityLog] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [targetCode, setTargetCode] = useState<string | null>(null);

  const models = status.data?.models ?? [];
  const groups = groupModels(models);
  const target = models.find((m) => m.code === targetCode);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["system-status"] });
    return qc.fetchQuery({ queryKey: ["system-status"], queryFn: () => systemApi.status() });
  }

  async function handleVerify(code: string) {
    setBusy(true);
    setMsg(null);
    try {
      const fresh = await refresh();
      const result = verifyModelIntegrity(fresh, code);
      setIntegrityLog(result.messages);
      setMsg(
        result.ok
          ? `Integridade OK · ${code}`
          : `Integridade incompleta · ${code}`,
      );
    } catch (e) {
      setMsg(friendlyError(e, "Falha ao verificar"));
    } finally {
      setBusy(false);
    }
  }

  function openDialog(kind: DialogKind, code: string) {
    setTargetCode(code);
    setDialog(kind);
  }

  async function confirmDialog() {
    if (!dialog || !targetCode) return;
    setBusy(true);
    setMsg(null);
    try {
      if (dialog === "import") {
        setMsg(
          `A instalação de “${targetCode}” por arquivo ainda não está disponível. Peça ao administrador para instalar o modelo no computador de processamento.`,
        );
      } else if (dialog === "update") {
        await refresh();
        setMsg(
          `Lista de modelos atualizada. A versão de “${targetCode}” é a instalada no computador de processamento.`,
        );
      } else if (dialog === "remove") {
        setMsg(
          `“${targetCode}” não pode ser removido por aqui, para não interromper separações em andamento.`,
        );
      }
    } finally {
      setBusy(false);
      setDialog(null);
      setTargetCode(null);
    }
  }

  return (
    <div className="page-shell space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet/20 text-violet">
            <BrainCircuit className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
              Modelos de IA
            </h1>
            <p className="text-sm text-ink-muted">
              Modelos instalados para separar faixas e analisar a voz.
            </p>
          </div>
        </div>
        {status.data ? (
          <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
              <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden />
              CPU {status.data.cpu_count ?? "—"} núcleos
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
              <CircuitBoard className="h-3.5 w-3.5 text-violet" aria-hidden />
              GPU {status.data.gpu_available ? "disponível" : "não detectada"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
              <HardDrive className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
              Livre {formatBytes(status.data.disk_free_bytes)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono">
              {status.data.separation_adapter}
            </span>
          </div>
        ) : null}
      </header>

      {status.data?.using_contract_silence ? (
        <p
          role="status"
          className="rounded-xl border border-signal-warn/40 bg-signal-warn/10 px-3 py-2 text-sm text-signal-warn"
        >
          {status.data.message}
        </p>
      ) : null}

      {msg ? (
        <p role="status" className="rounded-xl border border-line bg-canvas-raised/80 px-3 py-2 text-sm text-accent">
          {msg}
        </p>
      ) : null}

      {integrityLog ? (
        <section
          className="space-y-2 rounded-2xl border border-line bg-canvas-raised/90 p-4 text-sm shadow-panel"
          aria-label="Resultado da verificação"
        >
          <h2 className="text-sm font-semibold text-ink">Resultado da verificação</h2>
          <ul className="list-inside list-disc space-y-1 text-ink-muted">
            {integrityLog.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-violet/30 bg-violet/5 p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">{STEM_DIFF_PANEL.title}</h2>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-ink-muted">
          {STEM_DIFF_PANEL.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      {status.isLoading ? (
        <CardGridSkeleton label="Carregando modelos…" />
      ) : status.isError ? (
        <p role="alert" className="text-sm text-signal-err">
          {friendlyError(status.error, "Falha ao carregar modelos")}
        </p>
      ) : models.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum modelo no catálogo do servidor.</p>
      ) : (
        SECTION.map((sec) => {
          const items = groups[sec.id];
          if (!items.length) return null;
          return (
            <section key={sec.id} className="space-y-3" aria-labelledby={`sec-${sec.id}`}>
              <div>
                <h2 id={`sec-${sec.id}`} className="text-lg font-semibold text-ink">
                  {sec.title}
                </h2>
                <p className="text-xs text-ink-faint">{sec.hint}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {items.map((m) => (
                  <ModelCard
                    key={m.code}
                    model={m}
                    busy={busy}
                    onVerify={(c) => void handleVerify(c)}
                    onImportOffline={(c) => openDialog("import", c)}
                    onUpdate={(c) => openDialog("update", c)}
                    onRemove={(c) => openDialog("remove", c)}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      <ConfirmDialog
        open={dialog === "import"}
        title="Importar pacote offline"
        description={
          target
            ? `A instalação de “${target.label}” por arquivo ainda não está disponível nesta tela. Peça ao administrador do sistema para instalar o modelo no computador de processamento.`
            : "Importação por arquivo ainda não disponível."
        }
        confirmLabel="Entendi"
        onConfirm={() => void confirmDialog()}
        onCancel={() => setDialog(null)}
        busy={busy}
      />
      <ConfirmDialog
        open={dialog === "update"}
        title="Atualizar modelo"
        description={
          target
            ? `Atualizar “${target.label}” é feito no computador de processamento. Aqui você pode recarregar a lista de modelos para ver a versão instalada.`
            : "Atualização indisponível."
        }
        confirmLabel="Recarregar catálogo"
        onConfirm={() => void confirmDialog()}
        onCancel={() => setDialog(null)}
        busy={busy}
      />
      <ConfirmDialog
        open={dialog === "remove"}
        title="Remover modelo"
        description={
          target
            ? `Para não interromper separações em andamento, “${target.label}” só pode ser removido pelo administrador no computador de processamento.`
            : "Remoção indisponível."
        }
        confirmLabel="Entendi"
        danger
        onConfirm={() => void confirmDialog()}
        onCancel={() => setDialog(null)}
        busy={busy}
      />
    </div>
  );
}
