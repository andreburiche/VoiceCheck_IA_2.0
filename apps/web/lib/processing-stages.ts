export type StageId = "prepare" | "load" | "separate" | "post" | "save";

export type StageState = "done" | "running" | "wait" | "error";

export type ProcessingStage = {
  id: StageId;
  label: string;
  state: StageState;
};

export const PROCESSING_STAGE_DEFS: Array<{ id: StageId; label: string }> = [
  { id: "prepare", label: "Preparando áudio" },
  { id: "load", label: "Carregando modelo" },
  { id: "separate", label: "Separando fontes" },
  { id: "post", label: "Pós-processando" },
  { id: "save", label: "Salvando trilhas" },
];

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/** Percentual só é “mensurável” com progresso numérico do job (não inventado). */
export function measurableProgress(progress: number | string | null | undefined, status?: string): number | null {
  if (status === "queued") return null;
  const n = typeof progress === "string" ? Number(progress) : progress;
  if (n == null || Number.isNaN(n)) return null;
  if (n <= 0 && status !== "completed") return null;
  return Math.max(0, Math.min(100, n));
}

/**
 * Mapeia status/progresso reais do worker para as 5 etapas da UI.
 * Worker: preparing(5–15) → processing(35) → postprocessing(70+) → completed(100).
 */
export function mapProcessingStages(
  status: string | undefined,
  progress: number,
  stemsReady = 0,
): ProcessingStage[] {
  const s = status ?? "queued";
  const p = progress;

  const setAll = (state: StageState): ProcessingStage[] =>
    PROCESSING_STAGE_DEFS.map((d) => ({ ...d, state }));

  if (s === "completed") return setAll("done");
  if (s === "failed" || s === "cancelled") {
    const stages = mapProcessingStages(
      p >= 70 ? "postprocessing" : p >= 35 ? "processing" : p > 0 ? "preparing" : "queued",
      p,
      stemsReady,
    );
    const runningIdx = stages.findIndex((x) => x.state === "running");
    const idx = runningIdx >= 0 ? runningIdx : Math.max(0, stages.findIndex((x) => x.state === "wait"));
    return stages.map((st, i) => (i === idx ? { ...st, state: "error" as const } : st));
  }

  if (s === "queued") {
    return PROCESSING_STAGE_DEFS.map((d, i) => ({
      ...d,
      state: i === 0 ? ("running" as const) : ("wait" as const),
    }));
  }

  if (s === "preparing") {
    return PROCESSING_STAGE_DEFS.map((d) => {
      if (d.id === "prepare") return { ...d, state: "running" as const };
      return { ...d, state: "wait" as const };
    });
  }

  if (s === "processing") {
    const loading = p < 40;
    return PROCESSING_STAGE_DEFS.map((d) => {
      if (d.id === "prepare") return { ...d, state: "done" as const };
      if (d.id === "load") return { ...d, state: loading ? ("running" as const) : ("done" as const) };
      if (d.id === "separate") return { ...d, state: loading ? ("wait" as const) : ("running" as const) };
      return { ...d, state: "wait" as const };
    });
  }

  if (s === "postprocessing") {
    const saving = stemsReady > 0;
    return PROCESSING_STAGE_DEFS.map((d) => {
      if (d.id === "prepare" || d.id === "load" || d.id === "separate") {
        return { ...d, state: "done" as const };
      }
      if (d.id === "post") {
        return { ...d, state: saving && stemsReady >= 4 ? ("done" as const) : ("running" as const) };
      }
      return {
        ...d,
        state: saving ? ("running" as const) : ("wait" as const),
      };
    });
  }

  return setAll("wait");
}

/** ETA só quando há progresso intermediário e tempo decorrido mínimo (evita chute). */
export function estimateRemainingMs(
  progress: number | null,
  startedAt: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (progress == null || progress < 8 || progress >= 96) return null;
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  const elapsed = nowMs - started;
  if (elapsed < 8_000) return null;
  const remaining = (elapsed * (100 - progress)) / progress;
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 3_600_000) return null;
  return Math.round(remaining);
}

export function formatElapsed(startedAt: string | null | undefined, finishedAt?: string | null, nowMs = Date.now()): string | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return null;
  const end = finishedAt ? Date.parse(finishedAt) : nowMs;
  if (Number.isNaN(end)) return null;
  const sec = Math.max(0, Math.round((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return m > 0 ? `${m}m ${r.toString().padStart(2, "0")}s` : `${r}s`;
}

export function formatEta(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `~${sec}s`;
  const m = Math.ceil(sec / 60);
  return `~${m} min`;
}

export function isTerminalStatus(status: string | undefined): boolean {
  return !!status && TERMINAL.has(status);
}

export function isActiveStatus(status: string | undefined): boolean {
  return !!status && !TERMINAL.has(status);
}
