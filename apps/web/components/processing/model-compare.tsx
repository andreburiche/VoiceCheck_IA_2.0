"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { separationsApi, systemApi, type AudioAsset, type ProcessingJob } from "@/lib/api";

type Props = {
  projectId: string;
  assets: AudioAsset[];
};

export function ModelCompare({ projectId, assets }: Props) {
  const qc = useQueryClient();
  const readyAssets = assets.filter((a) => a.status === "ready" && a.kind === "original");
  const [assetId, setAssetId] = useState(readyAssets[0]?.id ?? "");
  const [modelA, setModelA] = useState("htdemucs");
  const [modelB, setModelB] = useState("htdemucs_two");
  const [jobA, setJobA] = useState<ProcessingJob | null>(null);
  const [jobB, setJobB] = useState<ProcessingJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sys = useQuery({
    queryKey: ["system-status"],
    queryFn: () => systemApi.status(),
    staleTime: 60_000,
  });

  const selectable = useMemo(
    () => (sys.data?.models ?? []).filter((m) => m.selectable),
    [sys.data?.models],
  );

  const start = useMutation({
    mutationFn: async () => {
      if (!assetId) throw new Error("Selecione um asset");
      if (modelA === modelB) throw new Error("Escolha dois modelos diferentes para comparar");
      if (selectable.length < 2) throw new Error("Precisa de ao menos 2 modelos instalados");
      const a = await separationsApi.create(
        projectId,
        { source_asset_id: assetId, model_code: modelA, params: {} },
        `cmp-a-${projectId}-${Date.now()}`,
      );
      const b = await separationsApi.create(
        projectId,
        { source_asset_id: assetId, model_code: modelB, params: {} },
        `cmp-b-${projectId}-${Date.now()}`,
      );
      return { a, b };
    },
    onSuccess: ({ a, b }) => {
      setJobA(a);
      setJobB(b);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["separations", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // poll leve
  useQuery({
    queryKey: ["cmp-jobs", jobA?.id, jobB?.id],
    enabled: Boolean(jobA?.id && jobB?.id),
    refetchInterval: (q) => {
      const data = q.state.data as { a?: ProcessingJob; b?: ProcessingJob } | undefined;
      if (!data) return 2000;
      const done = [data.a?.status, data.b?.status].every((s) =>
        ["completed", "failed", "cancelled"].includes(String(s)),
      );
      return done ? false : 2000;
    },
    queryFn: async () => {
      const a = await separationsApi.get(jobA!.id);
      const b = await separationsApi.get(jobB!.id);
      setJobA(a);
      setJobB(b);
      return { a, b };
    },
  });

  const bothDone =
    jobA?.status === "completed" && jobB?.status === "completed";

  if (readyAssets.length === 0 || selectable.length < 2) {
    return null;
  }

  return (
    <section
      className="space-y-3 rounded-2xl border border-violet/30 bg-violet/5 p-5"
      aria-label="Comparação de modelos"
    >
      <div>
        <h3 className="text-sm font-semibold text-ink">Comparar modelos (A/B)</h3>
        <p className="mt-1 text-xs text-ink-muted">
          Enfileira dois jobs no mesmo áudio. No estúdio, alterne o job ativo no painel lateral.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-ink-muted">
          Asset
          <select
            className="mt-1 block h-9 min-w-[180px] rounded-lg border border-line bg-canvas px-2 text-sm text-ink"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          >
            {readyAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.original_filename ?? a.id}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-ink-muted">
          Modelo A
          <select
            className="mt-1 block h-9 min-w-[160px] rounded-lg border border-line bg-canvas px-2 text-sm text-ink"
            value={modelA}
            onChange={(e) => setModelA(e.target.value)}
          >
            {selectable.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-ink-muted">
          Modelo B
          <select
            className="mt-1 block h-9 min-w-[160px] rounded-lg border border-line bg-canvas px-2 text-sm text-ink"
            value={modelB}
            onChange={(e) => setModelB(e.target.value)}
          >
            {selectable.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="violet"
          disabled={start.isPending || !assetId}
          onClick={() => start.mutate()}
        >
          {start.isPending ? "Enfileirando…" : "Iniciar A/B"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-signal-err">
          {error}
        </p>
      ) : null}

      {jobA && jobB ? (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <p className="rounded-xl border border-line bg-canvas/60 px-3 py-2 font-mono text-ink-muted">
            A · {jobA.model_code ?? modelA} · {jobA.status} · {String(jobA.progress)}%
          </p>
          <p className="rounded-xl border border-line bg-canvas/60 px-3 py-2 font-mono text-ink-muted">
            B · {jobB.model_code ?? modelB} · {jobB.status} · {String(jobB.progress)}%
          </p>
        </div>
      ) : null}

      {bothDone ? (
        <p className="text-sm text-accent">
          Ambos concluídos.{" "}
          <Link href={`/projects/${projectId}/studio`} className="underline">
            Abrir estúdio e alternar jobs
          </Link>
        </p>
      ) : null}
    </section>
  );
}
