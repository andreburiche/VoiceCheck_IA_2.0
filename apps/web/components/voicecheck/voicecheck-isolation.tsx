"use client";

import { CheckCircle2, Mic, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { voicecheckApi, type EnhanceJob, type EnhanceStats } from "@/lib/api";
import { friendlyError } from "@/lib/errors";

const KEY = (projectId: string) => `vc_isolate_job:${projectId}`;

function remember(projectId: string | null, jobId: string | null) {
  if (!projectId) return;
  try {
    if (jobId) window.localStorage.setItem(KEY(projectId), jobId);
    else window.localStorage.removeItem(KEY(projectId));
  } catch {
    /* sem armazenamento: só não retoma depois */
  }
}

function recall(projectId: string | null): string | null {
  if (!projectId) return null;
  try {
    return window.localStorage.getItem(KEY(projectId));
  } catch {
    return null;
  }
}

function fmt(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

/**
 * Isola a voz (IA, Demucs no worker) antes da análise. É automático: assim que
 * o áudio é preparado, a separação começa — a análise passa a medir só a voz.
 */
export function VoiceCheckIsolation({
  projectId,
  mixWav,
  isolated,
  usingMix,
  autoStart,
  durationSec,
  onIsolated,
  onUseMix,
}: {
  projectId: string | null;
  /** WAV preparado com instrumentos (entrada da separação). */
  mixWav: Blob | null;
  isolated: boolean;
  /** Usuário decidiu seguir com a gravação inteira. */
  usingMix: boolean;
  autoStart: boolean;
  durationSec?: number | null;
  onIsolated: (vocals: Blob, stats: EnhanceStats | null) => void;
  onUseMix: () => void;
}) {
  const [job, setJob] = useState<EnhanceJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const startedFor = useRef<Blob | null>(null);
  const running = job != null && (job.state === "queued" || job.state === "running");

  const start = useCallback(async () => {
    if (!mixWav) return;
    startedFor.current = mixWav;
    setError(null);
    try {
      const j = await voicecheckApi.isolateStart(mixWav);
      setJob(j);
      setStartedAt(Date.now());
      remember(projectId, j.job_id);
    } catch (e) {
      setError(friendlyError(e, "Não foi possível iniciar a separação da voz"));
    }
  }, [mixWav, projectId]);

  const finish = useCallback(
    async (done: EnhanceJob) => {
      try {
        const vocals = await voicecheckApi.enhanceAudio(done.job_id);
        onIsolated(vocals, done.stats);
        void voicecheckApi.enhanceDelete(done.job_id).catch(() => undefined);
      } catch (e) {
        setError(friendlyError(e, "Não foi possível baixar a voz isolada"));
      } finally {
        remember(projectId, null);
        setJob(null);
        setStartedAt(null);
      }
    },
    [onIsolated, projectId],
  );

  // Retoma uma separação em andamento (ex.: voltou para a página).
  useEffect(() => {
    if (isolated) return;
    const pending = recall(projectId);
    if (!pending) return;
    startedFor.current = mixWav;
    voicecheckApi
      .enhanceStatus(pending)
      .then((st) => {
        setJob(st);
        setStartedAt(st.created_at ? Date.parse(st.created_at) : Date.now());
        if (st.state === "done") void finish(st);
      })
      .catch(() => remember(projectId, null));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Automático: começa assim que há áudio preparado e a voz ainda não foi isolada.
  useEffect(() => {
    if (!autoStart || isolated || usingMix || !mixWav || running || error) return;
    if (startedFor.current === mixWav || recall(projectId)) return;
    void start();
  }, [autoStart, isolated, usingMix, mixWav, running, error, start, projectId]);

  useEffect(() => {
    if (!running || !job) return;
    const t = window.setInterval(async () => {
      try {
        const st = await voicecheckApi.enhanceStatus(job.job_id);
        setJob(st);
        if (st.state === "done") {
          window.clearInterval(t);
          void finish(st);
        } else if (st.state === "failed") {
          window.clearInterval(t);
          remember(projectId, null);
          setError(st.error || "A separação da voz falhou");
        }
      } catch (e) {
        if ((e as { status?: number }).status === 404) {
          window.clearInterval(t);
          remember(projectId, null);
          setJob(null);
          setError("A separação expirou. Tente de novo.");
        }
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [running, job?.job_id, finish, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  async function cancel() {
    if (job) await voicecheckApi.enhanceDelete(job.job_id).catch(() => undefined);
    remember(projectId, null);
    setJob(null);
    setStartedAt(null);
    setError("Separação cancelada.");
  }

  if (isolated) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-accent/[0.07] px-4 py-3 ring-1 ring-inset ring-accent/30" role="status">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div>
          <p className="text-sm font-medium text-ink">Voz isolada com IA</p>
          <p className="text-xs text-ink-muted">
            Instrumentos e acompanhamento foram removidos. A análise vai medir só a sua voz.
          </p>
        </div>
      </div>
    );
  }

  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  const estimate = durationSec ? Math.round(durationSec * 1.05 + 15) : null;
  const remaining = estimate != null ? Math.max(0, estimate - elapsed) : null;

  return (
    <div className="space-y-3 rounded-xl bg-ink/[0.03] px-4 py-3 ring-1 ring-inset ring-ink/10">
      <div className="flex items-start gap-3">
        <Mic className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Isolar a voz antes de analisar</p>
          <p className="text-xs text-ink-muted">
            A IA separa a sua voz dos instrumentos. Assim a análise não
            confunde violão, teclado ou bateria com o seu canto e os resultados ficam mais certos.
          </p>
        </div>
      </div>

      {running && job ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-ink">
              {job.state === "queued" ? "Na fila do processador…" : job.stage || "Separando…"}
            </span>
            <span className="text-data text-ink-muted">
              {fmt(elapsed)}
              {remaining != null
                ? remaining > 0
                  ? ` · faltam ~${remaining >= 90 ? `${Math.round(remaining / 60)} min` : `${remaining} s`}`
                  : " · quase lá"
                : ""}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700"
              style={{
                width: `${Math.max(3, job.progress, estimate ? Math.min(95, Math.round((elapsed / estimate) * 100)) : 0)}%`,
              }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-faint">
              Leva mais ou menos o tempo da música. Pode sair e voltar — a separação continua.
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={() => void cancel()}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Cancelar
            </Button>
          </div>
        </div>
      ) : usingMix ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-flare-soft">
            Analisando com a gravação inteira (instrumentos incluídos) — os resultados podem ser
            menos precisos.
          </p>
          <Button type="button" size="sm" variant="secondary" disabled={!mixWav} onClick={() => void start()}>
            <Mic className="h-3.5 w-3.5" aria-hidden />
            Isolar a voz agora
          </Button>
        </div>
      ) : error ? (
        <div className="space-y-2">
          <p role="alert" className="flex items-start gap-2 text-xs text-signal-err">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!mixWav} onClick={() => void start()}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Tentar de novo
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onUseMix}>
              Analisar com a gravação inteira
            </Button>
          </div>
        </div>
      ) : !mixWav ? (
        <p className="text-xs text-ink-faint">Começa sozinho assim que o áudio for extraído.</p>
      ) : (
        <Button type="button" size="sm" onClick={() => void start()}>
          <Mic className="h-3.5 w-3.5" aria-hidden />
          Isolar a voz
        </Button>
      )}
    </div>
  );
}
