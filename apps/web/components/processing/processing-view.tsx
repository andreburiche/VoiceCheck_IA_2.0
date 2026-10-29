"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Minimize2, Terminal } from "lucide-react";

import { ProcessingRing } from "@/components/processing/processing-ring";
import { ProcessingStagesList } from "@/components/processing/processing-stages-list";
import { StemsResult } from "@/components/processing/stems-result";
import { Button } from "@/components/ui/button";
import { API_URL, apiFetch, systemApi, type AudioAsset, type ProcessingJob } from "@/lib/api";
import {
  estimateRemainingMs,
  formatElapsed,
  formatEta,
  isActiveStatus,
  isTerminalStatus,
  mapProcessingStages,
  measurableProgress,
} from "@/lib/processing-stages";
import { friendlyError } from "@/lib/errors";

type ProcessingViewProps = {
  projectId: string;
  jobId: string;
  trackName?: string;
  sourceAsset?: AudioAsset | null;
  modelLabel?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
};

export function ProcessingView({
  projectId,
  jobId,
  trackName,
  sourceAsset,
  modelLabel,
  onDismiss,
  onRetry,
}: ProcessingViewProps) {
  const qc = useQueryClient();
  const [live, setLive] = useState<{
    status: string;
    progress: number;
    message?: string;
    stemsReady: string[];
  } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => apiFetch<ProcessingJob>(`/api/v1/processing-jobs/${jobId}`),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s && isTerminalStatus(s)) return false;
      return 2000;
    },
  });

  const stemsQuery = useQuery({
    queryKey: ["stems", projectId, jobId],
    queryFn: () =>
      apiFetch<{ items: { id: string; stem_type: string; asset_id: string }[]; total: number }>(
        `/api/v1/projects/${projectId}/stems?job_id=${jobId}`,
      ),
    enabled: !!projectId && !!jobId,
    refetchInterval: (q) => {
      const status = live?.status ?? jobQuery.data?.status;
      if (status && isTerminalStatus(status)) return false;
      return 3000;
    },
  });

  const sys = useQuery({
    queryKey: ["system-status"],
    queryFn: () => systemApi.status(),
    staleTime: 60_000,
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const url = `${API_URL}/api/v1/processing-jobs/${jobId}/events`;
    try {
      const es = new EventSource(url, { withCredentials: true });
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as {
            type?: string;
            status?: string;
            progress?: number;
            error_message?: string;
            stem?: string;
          };
          if (data.type === "stem_ready" && data.stem) {
            setLive((prev) => ({
              status: prev?.status ?? jobQuery.data?.status ?? "postprocessing",
              progress: data.progress ?? prev?.progress ?? 70,
              message: prev?.message,
              stemsReady: Array.from(new Set([...(prev?.stemsReady ?? []), data.stem!])),
            }));
            void qc.invalidateQueries({ queryKey: ["stems", projectId, jobId] });
            return;
          }
          if (data.status != null) {
            setLive((prev) => ({
              status: data.status!,
              progress: data.progress ?? prev?.progress ?? 0,
              message: data.error_message ?? prev?.message,
              stemsReady: prev?.stemsReady ?? [],
            }));
          }
          if (data.status && isTerminalStatus(data.status)) {
            void qc.invalidateQueries({ queryKey: ["job", jobId] });
            void qc.invalidateQueries({ queryKey: ["stems", projectId, jobId] });
            void qc.invalidateQueries({ queryKey: ["assets"] });
            es.close();
          }
        } catch {
          /* ignore */
        }
      };
      return () => es.close();
    } catch {
      return;
    }
  }, [jobId, projectId, qc, jobQuery.data?.status]);

  const cancel = useMutation({
    mutationFn: () =>
      apiFetch<{ message: string }>(`/api/v1/processing-jobs/${jobId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });

  const status = live?.status ?? jobQuery.data?.status;
  const rawProgress = live?.progress ?? Number(jobQuery.data?.progress ?? 0);
  const progress = measurableProgress(rawProgress, status);
  const stemsReadyCount = Math.max(
    live?.stemsReady.length ?? 0,
    stemsQuery.data?.items.length ?? 0,
  );
  const stages = useMemo(
    () => mapProcessingStages(status, progress ?? rawProgress, stemsReadyCount),
    [status, progress, rawProgress, stemsReadyCount],
  );

  const startedAt = jobQuery.data?.started_at ?? jobQuery.data?.created_at;
  const elapsed = formatElapsed(startedAt, jobQuery.data?.finished_at, now);
  const etaMs = isActiveStatus(status)
    ? estimateRemainingMs(progress, startedAt, now)
    : null;

  const deviceLabel = sys.data?.using_contract_silence
    ? "Modo de teste"
    : sys.data?.gpu_available
      ? "GPU"
      : "CPU";

  const title =
    trackName ||
    sourceAsset?.original_filename ||
    "Separação de faixas";

  const modelText =
    modelLabel ||
    (jobQuery.data?.model_version ? `Demucs ${jobQuery.data.model_version}` : "htdemucs");

  if (minimized && isActiveStatus(status)) {
    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 shadow-panel"
        role="status"
        aria-live="polite"
      >
        <span className="h-2 w-2 animate-pulse-meter rounded-full bg-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          <p className="text-xs text-ink-muted">
            Em segundo plano
            {progress != null ? ` · ${Math.round(progress)}%` : ""}
            {elapsed ? ` · ${elapsed}` : ""}
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setMinimized(false)}>
          Expandir
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          Cancelar
        </Button>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-canvas-raised/90 p-5 shadow-panel md:p-6">
        <StemsResult
          projectId={projectId}
          stems={stemsQuery.data?.items ?? []}
          onReprocess={onRetry}
        />
        {onDismiss ? (
          <div className="text-center">
            <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
              Fechar painel
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-2xl border border-line bg-canvas-raised/90 p-5 shadow-panel md:p-8">
      <header className="space-y-1 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Processando sua música</h2>
        <p className="text-sm text-ink-muted">
          Você pode continuar navegando — a separação continua enquanto isso.
        </p>
      </header>

      <dl className="mx-auto grid max-w-xl gap-2 text-center text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-faint">Música</dt>
          <dd className="truncate font-medium text-ink">{title}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Modelo</dt>
          <dd className="font-medium text-ink">{modelText}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Dispositivo</dt>
          <dd className="font-medium text-accent">{deviceLabel}</dd>
        </div>
      </dl>

      <ProcessingRing
        progress={progress}
        active={isActiveStatus(status)}
        label={
          progress != null
            ? `Progresso ${Math.round(progress)} por cento`
            : "Processamento em fila"
        }
      />

      <div className="flex flex-wrap justify-center gap-4 text-xs text-ink-muted">
        {elapsed ? (
          <span>
            Decorrido: <span className="font-mono text-ink">{elapsed}</span>
          </span>
        ) : null}
        {etaMs != null ? (
          <span>
            Estimativa: <span className="font-mono text-ink">{formatEta(etaMs)}</span>
          </span>
        ) : (
          <span className="text-ink-faint">Estimativa indisponível ainda</span>
        )}
      </div>

      <ProcessingStagesList stages={stages} />

      {(live?.message || jobQuery.data?.error_message) && status !== "cancelled" ? (
        <p role="alert" className="text-center text-sm text-signal-err">
          {live?.message || jobQuery.data?.error_message}
        </p>
      ) : null}

      {status === "failed" || status === "cancelled" ? (
        <div className="flex flex-wrap justify-center gap-2">
          <p className="w-full text-center text-sm text-ink-muted">
            {status === "cancelled" ? "Separação cancelada." : "A separação não terminou. Tente de novo; se repetir, tente outro arquivo ou um modelo mais leve."}
          </p>
          {onRetry ? (
            <Button type="button" onClick={onRetry}>
              Tentar novamente
            </Button>
          ) : null}
          {onDismiss ? (
            <Button type="button" variant="ghost" onClick={onDismiss}>
              Fechar
            </Button>
          ) : null}
        </div>
      ) : null}

      {isActiveStatus(status) ? (
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? "Cancelando…" : "Cancelar"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMinimized(true)}>
            <Minimize2 className="h-4 w-4" aria-hidden />
            Minimizar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowTech((v) => !v)}>
            <Terminal className="h-4 w-4" aria-hidden />
            {showTech ? "Ocultar detalhes" : "Detalhes técnicos"}
            {showTech ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ) : null}

      {showTech ? (
        <div className="rounded-xl border border-line bg-canvas/60 p-4 font-mono text-xs text-ink-muted">
          <p>job_id: {jobId}</p>
          <p>status: {status ?? "—"}</p>
          <p>progress_raw: {rawProgress}</p>
          <p>attempt: {jobQuery.data?.attempt ?? "—"}</p>
          <p>adapter: {sys.data?.separation_adapter ?? "—"}</p>
          <p>model_version: {jobQuery.data?.model_version ?? "—"}</p>
          <p>source_asset: {jobQuery.data?.source_asset_id ?? sourceAsset?.id ?? "—"}</p>
          <p>error_code: {jobQuery.data?.error_code ?? "—"}</p>
          {cancel.isError ? (
            <p className="text-signal-err">{friendlyError(cancel.error)}</p>
          ) : null}
        </div>
      ) : null}

      <p className="text-center text-xs text-ink-faint">
        Você pode continuar navegando — o andamento atualiza sozinho.
      </p>
    </div>
  );
}
