/** Latência de monitor/gravação (ms) — só localStorage, aplicada na reprodução sincronizada. */

const KEY = "estudio_musical_practice_latency_ms";

export function getPracticeLatencyMs(): number {
  if (typeof window === "undefined") return 0;
  const v = Number(window.localStorage.getItem(KEY));
  if (!Number.isFinite(v)) return 0;
  return Math.max(-500, Math.min(500, Math.round(v)));
}

export function setPracticeLatencyMs(ms: number): void {
  if (typeof window === "undefined") return;
  const clamped = Math.max(-500, Math.min(500, Math.round(ms)));
  window.localStorage.setItem(KEY, String(clamped));
}

/** Tempo na timeline da música para alinhar o ensaio ao playhead. */
export function syncedBackingTime(
  offsetSec: number,
  takeCurrentSec: number,
  latencyMs: number = getPracticeLatencyMs(),
): number {
  return Math.max(0, offsetSec + takeCurrentSec + latencyMs / 1000);
}
