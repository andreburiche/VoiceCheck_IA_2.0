"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { ModelCompare } from "@/components/processing/model-compare";
import { ProcessingView } from "@/components/processing/processing-view";
import { Button } from "@/components/ui/button";
import { apiFetch, systemApi, type AudioAsset, type ProcessingJob } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { STEM_LABELS } from "@/lib/stem-theme";

type SeparationPanelProps = {
  projectId: string;
  assets: AudioAsset[];
  highlightJobId?: string | null;
  trackName?: string;
};

export function SeparationPanel({
  projectId,
  assets,
  highlightJobId,
  trackName,
}: SeparationPanelProps) {
  const readyAssets = assets.filter((a) => a.status === "ready" && a.kind === "original");
  const [assetId, setAssetId] = useState(readyAssets[0]?.id ?? "");
  const [modelCode, setModelCode] = useState("htdemucs");
  const [preview15, setPreview15] = useState(false);
  const [qualidade, setQualidade] = useState<"rapida" | "equilibrada" | "maxima">("rapida");
  const [avancado, setAvancado] = useState(false);
  const [shifts, setShifts] = useState(0);
  const [overlap, setOverlap] = useState(0.25);
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightJobId) setJobId(highlightJobId);
  }, [highlightJobId]);

  useEffect(() => {
    if (!assetId && readyAssets[0]) setAssetId(readyAssets[0].id);
  }, [assetId, readyAssets]);

  const sys = useQuery({
    queryKey: ["system-status"],
    queryFn: () => systemApi.status(),
    staleTime: 60_000,
  });

  const selectableModels = useMemo(
    () => (sys.data?.models ?? []).filter((m) => m.selectable),
    [sys.data?.models],
  );

  useEffect(() => {
    if (!selectableModels.length) return;
    if (!selectableModels.some((m) => m.code === modelCode)) {
      setModelCode(selectableModels[0]!.code);
    }
  }, [selectableModels, modelCode]);

  const start = useMutation({
    mutationFn: async () => {
      const key = `sep-${projectId}-${assetId}-${modelCode}-${preview15 ? "p15" : "full"}-${Date.now()}`;
      const params: Record<string, unknown> = { qualidade };
      if (preview15) params.preview_seconds = 15;
      if (avancado) {
        params.shifts = shifts;
        params.overlap = overlap;
      }
      return apiFetch<ProcessingJob>(`/api/v1/projects/${projectId}/separations`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        json: { source_asset_id: assetId, model_code: modelCode, params },
      });
    },
    onSuccess: (job) => setJobId(job.id),
  });

  const source = readyAssets.find((a) => a.id === assetId) ?? readyAssets[0] ?? null;
  const selectedModel = selectableModels.find((m) => m.code === modelCode);
  const modelLabel = selectedModel
    ? `${selectedModel.label} · ${selectedModel.code}`
    : "Básico (4 fontes) · htdemucs";

  return (
    <div id="separacao" className="scroll-mt-24 space-y-4">
      {jobId ? (
        <ProcessingView
          projectId={projectId}
          jobId={jobId}
          trackName={trackName || source?.original_filename || undefined}
          sourceAsset={source}
          modelLabel={modelLabel}
          onDismiss={() => setJobId(null)}
          onRetry={() => {
            if (assetId) start.mutate();
          }}
        />
      ) : (
        <div className="space-y-4 rounded-2xl border border-line bg-canvas-raised/90 p-5 shadow-panel">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">Separação de faixas</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Separe de novo um áudio já enviado ou acompanhe a separação iniciada na importação.
            </p>
            {sys.data?.using_contract_silence ? (
              <p
                role="status"
                className="mt-2 rounded-xl border border-signal-warn/40 bg-signal-warn/10 px-3 py-2 text-sm text-signal-warn"
              >
                Modo de teste ativo: as faixas serão geradas em silêncio, sem separar o áudio de verdade.
              </p>
            ) : sys.data ? (
              <p className="mt-2 text-xs text-ink-faint">
                Processamento na {sys.data.gpu_available ? "placa de vídeo (GPU)" : "CPU"} do computador.
              </p>
            ) : null}
          </div>

          {readyAssets.length === 0 ? (
            <p className="text-sm text-ink-faint">Envie um áudio no assistente acima para poder separar.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm text-ink-muted">
                Áudio
                <select
                  className="mt-1 block h-10 w-full min-w-[220px] rounded-lg border border-line bg-canvas-raised px-3 text-ink"
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
              <label className="block text-sm text-ink-muted">
                Modelo
                <select
                  className="mt-1 block h-10 w-full min-w-[240px] rounded-lg border border-line bg-canvas-raised px-3 text-ink"
                  value={modelCode}
                  onChange={(e) => setModelCode(e.target.value)}
                  disabled={!selectableModels.length}
                >
                  {selectableModels.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label} ({m.stems.length} fontes)
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-ink-muted">
                Qualidade
                <select
                  className="mt-1 block h-10 w-full min-w-[200px] rounded-lg border border-line bg-canvas-raised px-3 text-ink"
                  value={qualidade}
                  onChange={(e) => setQualidade(e.target.value as typeof qualidade)}
                  data-testid="sep-qualidade"
                >
                  <option value="rapida">Rápida</option>
                  <option value="equilibrada">Equilibrada (~2x o tempo)</option>
                  <option value="maxima">Máxima (~3x o tempo)</option>
                </select>
              </label>
              <Button type="button" onClick={() => start.mutate()} disabled={!assetId || start.isPending}>
                {start.isPending ? "Enfileirando…" : preview15 ? "Prévia 15s" : "Iniciar Separação"}
              </Button>
              <label className="flex items-center gap-2 pb-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={preview15}
                  onChange={(e) => setPreview15(e.target.checked)}
                />
                Prévia rápida (15s do início — Demucs real no trecho)
              </label>
            </div>
          )}

          {selectedModel ? (
            <p className="text-sm text-ink-muted" data-testid="sep-modelo-descricao">
              <span className="font-medium text-ink">{selectedModel.label}:</span> {selectedModel.description}{" "}
              <span className="text-ink-faint">
                Faixas: {selectedModel.stems.map((s) => STEM_LABELS[s] ?? s).join(", ")}.
              </span>
            </p>
          ) : null}

          {readyAssets.length ? (
            <details className="rounded-xl border border-line/70 px-3 py-2" open={avancado}
              onToggle={(e) => setAvancado((e.target as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer text-sm font-medium text-ink">Ajustes avançados (como no UVR)</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-ink-muted">
                  Passadas deslocadas (shifts): <span className="font-mono text-ink">{shifts}</span>
                  <input type="range" min={0} max={5} step={1} value={shifts} onChange={(e) => setShifts(Number(e.target.value))}
                    className="mt-2 block w-full accent-[rgb(var(--c-accent))]" data-testid="sep-shifts" />
                  <span className="text-xs text-ink-faint">Cada passada repete a separação com o áudio deslocado e tira a média: menos artefatos, mais tempo.</span>
                </label>
                <label className="block text-sm text-ink-muted">
                  Sobreposição entre trechos (overlap): <span className="font-mono text-ink">{overlap.toFixed(2)}</span>
                  <input type="range" min={0.1} max={0.75} step={0.05} value={overlap} onChange={(e) => setOverlap(Number(e.target.value))}
                    className="mt-2 block w-full accent-[rgb(var(--c-accent))]" data-testid="sep-overlap" />
                  <span className="text-xs text-ink-faint">Mais sobreposição suaviza as emendas entre os pedaços processados.</span>
                </label>
              </div>
              <p className="mt-2 text-xs text-ink-faint">Com os ajustes abertos, eles valem no lugar da qualidade escolhida acima.</p>
            </details>
          ) : null}

          {start.isError ? (
            <p role="alert" className="text-sm text-signal-err">
              {friendlyError(start.error)}
            </p>
          ) : null}

          <ModelCompare projectId={projectId} assets={assets} />
        </div>
      )}
    </div>
  );
}
