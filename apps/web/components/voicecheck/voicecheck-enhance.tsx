"use client";

import {
  AudioLines,
  CheckCircle2,
  Download,
  Info,
  Mic,
  Pause,
  Play,
  Sparkles,
  Trash2,
  Waves,
  Wind,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  voicecheckApi,
  type AutotuneScale,
  type EnhanceEventIn,
  type EnhanceJob,
  type EnhanceSettings,
  type EnhanceStats,
} from "@/lib/api";
import { useObjectUrl } from "@/lib/use-object-url";
import { cn } from "@/lib/utils";
import type { VoiceCheckAutotuneInfo } from "@/lib/voicecheck-store";
import { friendlyError } from "@/lib/errors";

const KEYS = ["Dó", "Dó#", "Ré", "Ré#", "Mi", "Fá", "Fá#", "Sol", "Sol#", "Lá", "Lá#", "Si"];

const PITCH_CATEGORIES = new Set([
  "pitch_above_reference",
  "pitch_below_reference",
  "melodic_consistency_variation",
  "unstable_sustained_pitch",
  "irregular_pitch_modulation",
]);
const isPitch = (c: string) => PITCH_CATEGORIES.has(c) || (c.startsWith("pitch_") && c !== "pitch");

const STYLES = [
  { id: "natural", label: "Natural", retuneMs: 80, humanizeCents: 15, hint: "Preserva vibrato e expressão." },
  { id: "firme", label: "Firme", retuneMs: 35, humanizeCents: 6, hint: "Afinação mais presa, ainda suave." },
  { id: "robotico", label: "Robótico", retuneMs: 0, humanizeCents: 0, hint: "Efeito “autotune” evidente." },
] as const;

export const DEFAULT_ENHANCE: EnhanceSettings = {
  isolate: true,
  denoise: true,
  pitchMode: "events",
  baseStrength: 30,
  key: "auto",
  scale: "auto",
  retuneMs: 80,
  humanizeCents: 15,
  leveling: true,
  breaths: true,
};

export type EnhanceSourceEvent = {
  id: string;
  category: string;
  title?: string;
  description?: string;
  start_seconds: number;
  end_seconds: number;
  expected_note?: string | null;
};

const JOB_KEY = (projectId: string) => `vc_enhance_job:${projectId}`;

function storeJob(projectId: string | null, jobId: string | null) {
  if (!projectId) return;
  try {
    if (jobId) window.localStorage.setItem(JOB_KEY(projectId), jobId);
    else window.localStorage.removeItem(JOB_KEY(projectId));
  } catch {
    /* armazenamento indisponível: só não retoma depois */
  }
}

function readJob(projectId: string | null): string | null {
  if (!projectId) return null;
  try {
    return window.localStorage.getItem(JOB_KEY(projectId));
  } catch {
    return null;
  }
}

function fmtTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

/**
 * "Aprimorar com IA": deixa só a voz (Demucs), limpa o som e corrige, trecho a
 * trecho, os erros que a análise encontrou. Gera uma nova versão — a gravação
 * original não muda.
 */
export function VoiceCheckEnhance({
  projectId,
  preparedWav,
  correctedWav,
  info,
  events,
  assetName,
  durationSec,
  alreadyIsolated = false,
  onResult,
  onDiscard,
}: {
  projectId: string | null;
  preparedWav: Blob | null;
  correctedWav: Blob | null;
  info: VoiceCheckAutotuneInfo | null;
  events: EnhanceSourceEvent[];
  assetName?: string | null;
  /** Duração da gravação (s), para estimar o tempo de processamento. */
  durationSec?: number | null;
  /** O áudio preparado já é só a voz (isolada na preparação). */
  alreadyIsolated?: boolean;
  onResult: (wav: Blob, info: VoiceCheckAutotuneInfo) => void;
  onDiscard: () => void;
}) {
  const saved = info && info.kind === "enhance" ? info : null;
  const [settings, setSettings] = useState<EnhanceSettings>(saved?.settings ?? DEFAULT_ENHANCE);
  const [job, setJob] = useState<EnhanceJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [source, setSource] = useState<"original" | "aprimorada">(correctedWav ? "aprimorada" : "original");
  const [playing, setPlaying] = useState(false);
  const [listFilter, setListFilter] = useState<"fixed" | "other">("fixed");
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const s = info && info.kind === "enhance" ? info : null;
    setSettings(s?.settings ?? DEFAULT_ENHANCE);
  }, [info]);

  const stats: EnhanceStats | null = saved?.stats ?? null;
  const running = job != null && (job.state === "queued" || job.state === "running");

  // Contagem do que a análise encontrou
  const counts = useMemo(() => {
    let pitch = 0;
    let drops = 0;
    let breaths = 0;
    for (const e of events) {
      if (isPitch(e.category)) pitch += 1;
      else if (e.category === "abrupt_intensity_drop") drops += 1;
      else if (e.category === "possible_audible_breath") breaths += 1;
    }
    return { pitch, drops, breaths };
  }, [events]);

  const originalUrl = useObjectUrl(preparedWav);
  const correctedUrl = useObjectUrl(correctedWav);
  useEffect(() => {
    if (!correctedWav) setSource("original");
  }, [correctedWav]);

  const finish = useCallback(
    async (done: EnhanceJob) => {
      try {
        const wav = await voicecheckApi.enhanceAudio(done.job_id);
        onResult(wav, {
          kind: "enhance",
          settings,
          stats: done.stats,
          createdAt: new Date().toISOString(),
        });
        setSource("aprimorada");
        void voicecheckApi.enhanceDelete(done.job_id).catch(() => undefined);
      } catch (e) {
        setError(friendlyError(e, "Não foi possível baixar o resultado"));
      } finally {
        storeJob(projectId, null);
        setJob(null);
        setStartedAt(null);
      }
    },
    [onResult, projectId, settings],
  );

  // Acompanha o job (a cada 2 s) — e retoma um job em andamento ao reabrir a página.
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
          setError(st.error || "O aprimoramento falhou");
          storeJob(projectId, null);
        }
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 404) {
          window.clearInterval(t);
          setJob(null);
          storeJob(projectId, null);
          setError("O processamento expirou. Tente de novo.");
        }
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [running, job?.job_id, finish, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const pending = readJob(projectId);
    if (!pending) return;
    voicecheckApi
      .enhanceStatus(pending)
      .then((st) => {
        setJob(st);
        setStartedAt(st.created_at ? Date.parse(st.created_at) : Date.now());
        if (st.state === "done") void finish(st);
      })
      .catch(() => storeJob(projectId, null));
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const toSend = useMemo<EnhanceEventIn[]>(
    () =>
      events.map((e) => ({
        id: e.id,
        category: e.category,
        // Sem título, o servidor usa o nome em português da categoria.
        title: e.title || e.category,
        start_seconds: e.start_seconds,
        end_seconds: e.end_seconds,
        expected_note: e.expected_note ?? null,
      })),
    [events],
  );

  async function start() {
    if (!preparedWav) return;
    setError(null);
    try {
      // Voz já isolada na preparação: não repete a separação (economiza minutos).
      const j = await voicecheckApi.enhanceStart(
        preparedWav,
        alreadyIsolated ? { ...settings, isolate: false } : settings,
        toSend,
      );
      setJob(j);
      setStartedAt(Date.now());
      storeJob(projectId, j.job_id);
    } catch (e) {
      setError(friendlyError(e, "Não foi possível iniciar o aprimoramento"));
    }
  }

  async function cancel() {
    if (!job) return;
    await voicecheckApi.enhanceDelete(job.job_id).catch(() => undefined);
    storeJob(projectId, null);
    setJob(null);
    setStartedAt(null);
  }

  function switchTo(next: "original" | "aprimorada", seekTo?: number) {
    const el = audioRef.current;
    const t = seekTo ?? el?.currentTime ?? 0;
    const wasPlaying = seekTo != null ? true : el ? !el.paused : false;
    const apply = () => {
      const a = audioRef.current;
      if (!a) return;
      a.currentTime = t;
      if (wasPlaying) void a.play().catch(() => undefined);
    };
    if (next === source) {
      apply();
      return;
    }
    setSource(next);
    requestAnimationFrame(() => {
      const a = audioRef.current;
      if (!a) return;
      const once = () => {
        apply();
        a.removeEventListener("loadedmetadata", once);
      };
      a.addEventListener("loadedmetadata", once);
    });
  }

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => undefined);
    else a.pause();
  }

  function download() {
    if (!correctedWav) return;
    const url = URL.createObjectURL(correctedWav);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(assetName || "voz").replace(/\.[^.]+$/, "")} (aprimorada).wav`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const set = (patch: Partial<EnhanceSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const style = STYLES.find((s) => s.retuneMs === settings.retuneMs && s.humanizeCents === settings.humanizeCents);
  const currentUrl = source === "aprimorada" && correctedUrl ? correctedUrl : originalUrl;
  const pitchStats = stats?.pitch && !("skipped" in stats.pitch && stats.pitch.skipped) ? stats.pitch : null;
  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
  // Separação no CPU leva ~1× a duração da música; o resto, ~15%.
  const isolating = settings.isolate && !alreadyIsolated;
  const estimate = durationSec ? Math.round(durationSec * (isolating ? 1.2 : 0.2) + 10) : null;
  const remaining = estimate != null ? Math.max(0, estimate - elapsed) : null;

  return (
    <section className="panel-glass space-y-5 rounded-2xl p-4 md:p-5" aria-labelledby="vc-enhance-title">
      <div>
        <p className="hud-label flex items-center gap-2 text-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          IA · voz isolada, limpa e corrigida
        </p>
        <h2 id="vc-enhance-title" className="mt-1 font-display text-xl font-semibold text-ink">
          Aprimorar com IA
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Separa a sua voz dos instrumentos, limpa o som e corrige um a um os trechos em que a
          análise encontrou erros. Gera uma nova versão para comparar — a gravação original não é
          alterada.
        </p>
      </div>

      {!preparedWav ? (
        <p className="rounded-xl border border-dashed border-ink/15 px-4 py-3 text-sm text-ink-muted">
          Prepare o áudio na etapa 2 para poder aprimorar.
        </p>
      ) : (
        <>
          <fieldset className="grid gap-2 md:grid-cols-2" disabled={running}>
            <legend className="hud-label mb-2">O que fazer</legend>
            <Toggle
              icon={Mic}
              checked={alreadyIsolated || settings.isolate}
              disabled={alreadyIsolated}
              onChange={(v) => set({ isolate: v })}
              title="Deixar só a voz"
              text={
                alreadyIsolated
                  ? "Já feito na preparação: a voz foi isolada com IA antes da análise."
                  : "Remove instrumentos e acompanhamento com IA. Leva alguns minutos."
              }
            />
            <Toggle
              icon={Waves}
              checked={settings.denoise}
              onChange={(v) => set({ denoise: v })}
              title="Limpar e melhorar o som"
              text="Tira ronco e chiado, reduz ruído de fundo e suaviza os “s”."
            />
            <Toggle
              icon={Wand2}
              checked={settings.pitchMode !== "off"}
              onChange={(v) => set({ pitchMode: v ? "events" : "off" })}
              title="Corrigir os erros de afinação"
              text={
                counts.pitch > 0
                  ? `${counts.pitch} ${counts.pitch === 1 ? "trecho apontado" : "trechos apontados"} pela análise, corrigidos um a um.`
                  : "A análise não apontou erros de afinação; aplica só a correção leve no restante."
              }
            />
            <Toggle
              icon={AudioLines}
              checked={settings.leveling}
              onChange={(v) => set({ leveling: v })}
              title="Equilibrar o volume"
              text={
                counts.drops > 0
                  ? `${counts.drops} ${counts.drops === 1 ? "queda" : "quedas"} de intensidade compensadas, e o resto nivelado.`
                  : "Nivela trechos fracos e fortes e ajusta o volume final."
              }
            />
            <Toggle
              icon={Wind}
              checked={settings.breaths}
              onChange={(v) => set({ breaths: v })}
              title="Suavizar respirações"
              text={
                counts.breaths > 0
                  ? `${counts.breaths} ${counts.breaths === 1 ? "respiração audível" : "respirações audíveis"} abaixadas em 6 dB.`
                  : "Nenhuma respiração audível apontada nesta gravação."
              }
            />
          </fieldset>

          {settings.pitchMode !== "off" ? (
            <div className="grid gap-4 rounded-2xl bg-ink/[0.03] p-4 ring-1 ring-inset ring-ink/10 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <p className="hud-label">Estilo da correção</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Estilo da correção">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={running}
                      aria-pressed={style?.id === s.id}
                      title={s.hint}
                      onClick={() => set({ retuneMs: s.retuneMs, humanizeCents: s.humanizeCents })}
                      className={cn(
                        "rounded-xl px-3 py-1.5 text-sm ring-1 ring-inset transition-colors",
                        style?.id === s.id
                          ? "bg-accent/15 text-accent ring-accent/40"
                          : "bg-canvas-raised/60 text-ink-muted ring-ink/10 hover:text-ink",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="en-base" className="text-xs text-ink-muted">
                    Correção no restante da música
                  </Label>
                  <span className="text-data text-xs text-ink">
                    {settings.pitchMode === "all" ? "100%" : `${settings.baseStrength}%`}
                  </span>
                </div>
                <input
                  id="en-base"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  disabled={running}
                  value={settings.pitchMode === "all" ? 100 : settings.baseStrength}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    set({ baseStrength: v, pitchMode: v >= 100 ? "all" : "events" });
                  }}
                  className="h-3 w-full accent-[var(--accent)]"
                  aria-describedby="en-base-hint"
                />
                <p id="en-base-hint" className="text-xs text-ink-faint">
                  Os trechos com erro são sempre corrigidos por completo. Aqui você escolhe o quanto
                  mexer no que já estava bom (0% = nada).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="en-key" className="text-xs text-ink-muted">
                    Tonalidade
                  </Label>
                  <select
                    id="en-key"
                    disabled={running}
                    value={settings.key === "auto" ? "auto" : String(settings.key)}
                    onChange={(e) => set({ key: e.target.value === "auto" ? "auto" : Number(e.target.value) })}
                    className="h-10 w-full rounded-xl border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <option value="auto">Detectar</option>
                    {KEYS.map((k, i) => (
                      <option key={k} value={i}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="en-scale" className="text-xs text-ink-muted">
                    Escala
                  </Label>
                  <select
                    id="en-scale"
                    disabled={running}
                    value={settings.scale}
                    onChange={(e) => set({ scale: e.target.value as AutotuneScale })}
                    className="h-10 w-full rounded-xl border border-line bg-canvas-raised px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <option value="auto">Detectar</option>
                    <option value="major">Maior</option>
                    <option value="minor">Menor</option>
                    <option value="chromatic">Cromática</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}

          {running && job ? (
            <div className="space-y-3 rounded-2xl bg-accent/[0.06] p-4 ring-1 ring-inset ring-accent/25" role="status" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  {job.state === "queued" ? "Na fila do processador…" : job.stage || "Processando…"}
                </p>
                <span className="text-data text-xs text-ink-muted">
                  {fmtTime(elapsed)}
                  {remaining != null
                    ? remaining > 0
                      ? ` · faltam ~${remaining >= 90 ? `${Math.round(remaining / 60)} min` : `${remaining} s`}`
                      : " · quase lá"
                    : ` · ${job.progress}%`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-700"
                  style={{
                    width: `${Math.max(
                      3,
                      job.progress,
                      estimate ? Math.min(95, Math.round((elapsed / estimate) * 100)) : 0,
                    )}%`,
                  }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-faint">
                  {isolating
                    ? "Separar a voz com IA leva mais ou menos o tempo da própria música. Pode usar outras partes do app — ao voltar aqui, o resultado é retomado."
                    : "Leva menos de 1 minuto."}
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={() => void cancel()}>
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void start()}>
                <Sparkles className="h-4 w-4" aria-hidden />
                {correctedWav ? "Aprimorar de novo" : "Aprimorar com IA"}
              </Button>
              {correctedWav ? (
                <span className="text-xs text-ink-faint">A nova versão substitui a atual.</span>
              ) : null}
            </div>
          )}
          {error ? (
            <p role="alert" className="text-sm text-signal-err">
              {error}
            </p>
          ) : null}

          {correctedWav ? (
            <div className="space-y-4 rounded-2xl bg-ink/[0.03] p-4 ring-1 ring-inset ring-ink/10">
              {stats ? (
                <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Fact label="Voz isolada" value={stats.isolated ? "Sim (IA)" : "Não"} good={stats.isolated} />
                  <Fact
                    label="Ruído de fundo"
                    value={
                      stats.cleanup?.noise_reduction_db != null && stats.cleanup.noise_reduction_db > 0.5
                        ? `−${stats.cleanup.noise_reduction_db} dB`
                        : "—"
                    }
                    good={(stats.cleanup?.noise_reduction_db ?? 0) > 0.5}
                  />
                  <div className="min-w-0">
                    <dt className="hud-label">Notas no centro</dt>
                    <dd className="text-data mt-1 text-sm">
                      {pitchStats && "before" in pitchStats ? (
                        <>
                          <span className="text-ink-muted">{pitchStats.before.in_tune_percent ?? "—"}%</span>
                          <span className="text-ink-faint" aria-hidden> → </span>
                          <span className="sr-only">depois</span>
                          <span className="font-semibold text-accent">{pitchStats.after.in_tune_percent ?? "—"}%</span>
                        </>
                      ) : (
                        <span className="text-ink-muted">sem correção</span>
                      )}
                    </dd>
                  </div>
                  <Fact
                    label="Erros corrigidos"
                    value={`${stats.fixed_count} de ${stats.corrections.length}`}
                    good={stats.fixed_count > 0}
                  />
                </dl>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-xl bg-canvas-raised p-1 ring-1 ring-inset ring-ink/10" role="group" aria-label="Comparar versões">
                  {(["original", "aprimorada"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={source === v}
                      onClick={() => switchTo(v)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-sm transition-colors",
                        source === v ? "bg-accent text-canvas" : "text-ink-muted hover:text-ink",
                      )}
                    >
                      {v === "original" ? "Original" : "Aprimorada"}
                    </button>
                  ))}
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={togglePlay}>
                  {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                  {playing ? "Pausar" : "Ouvir"}
                </Button>
                <span className="text-xs text-ink-faint">Troque durante a música para comparar no mesmo ponto.</span>
              </div>
              {currentUrl ? (
                <audio
                  ref={audioRef}
                  src={currentUrl}
                  controls
                  preload="metadata"
                  className="w-full"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                />
              ) : null}

              {stats && stats.corrections.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="hud-label">Trecho a trecho</p>
                    <div className="inline-flex rounded-lg bg-canvas-raised p-0.5 ring-1 ring-inset ring-ink/10" role="group" aria-label="Filtrar trechos">
                      {(
                        [
                          ["fixed", `Corrigidos (${stats.corrections.filter((c) => c.fixed).length})`],
                          ["other", `Não alterados (${stats.corrections.filter((c) => !c.fixed).length})`],
                        ] as const
                      ).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={listFilter === v}
                          onClick={() => setListFilter(v)}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs transition-colors",
                            listFilter === v ? "bg-accent/15 text-accent" : "text-ink-muted hover:text-ink",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {listFilter === "other" ? (
                    <p className="text-xs text-ink-faint">
                      Pontos que a análise apontou mas que não dá para consertar no áudio sem inventar
                      som (quebras, notas não cantadas, ritmo) — vale treinar.
                    </p>
                  ) : null}
                  <ul className="max-h-80 divide-y divide-ink/[0.07] overflow-y-auto rounded-xl ring-1 ring-inset ring-ink/10">
                    {stats.corrections
                      .filter((c) => (listFilter === "fixed" ? c.fixed : !c.fixed))
                      .slice(0, 400)
                      .map((c) => (
                      <li key={`${c.event_id}-${c.start_seconds}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-canvas-raised/40 px-3 py-2 text-sm">
                        <span className="text-data w-11 shrink-0 text-xs text-flare-soft">{fmtTime(c.start_seconds)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ink">{c.title}</span>
                          <span className={cn("block text-xs", c.fixed ? "text-ink-muted" : "text-ink-faint")}>
                            {c.fixed ? (
                              <CheckCircle2 className="mr-1 inline h-3 w-3 text-accent" aria-hidden />
                            ) : (
                              <Info className="mr-1 inline h-3 w-3" aria-hidden />
                            )}
                            {c.action}
                          </span>
                        </span>
                        {c.before_cents != null && c.after_cents != null ? (
                          <span className="text-data shrink-0 text-xs">
                            <span className="text-ink-muted">{Math.round(c.before_cents)}¢</span>
                            <span className="text-ink-faint" aria-hidden> → </span>
                            <span className="sr-only">depois</span>
                            <span className={c.fixed ? "text-accent" : "text-ink"}>{Math.round(c.after_cents)}¢</span>
                          </span>
                        ) : null}
                        <span className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Ouvir o original em ${fmtTime(c.start_seconds)}`}
                            title="Ouvir original"
                            onClick={() => switchTo("original", Math.max(0, c.start_seconds - 0.5))}
                          >
                            A
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Ouvir o aprimorado em ${fmtTime(c.start_seconds)}`}
                            title="Ouvir aprimorada"
                            onClick={() => switchTo("aprimorada", Math.max(0, c.start_seconds - 0.5))}
                          >
                            B
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {stats?.warnings?.length ? (
                <ul className="space-y-1">
                  {stats.warnings.map((w) => (
                    <li key={w} className="text-xs text-flare-soft">
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={download}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Baixar WAV aprimorado
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="hover:text-signal-err"
                  onClick={onDiscard}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Descartar versão aprimorada
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-ink-faint">
                Use a versão aprimorada como referência para treinar. Quebras de voz e trechos
                saturados não são “consertados” — o app não inventa som que você não cantou. Ela é
                salva junto com este diagnóstico.
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function Toggle({
  icon: Icon,
  checked,
  disabled,
  onChange,
  title,
  text,
}: {
  icon: typeof Mic;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  title: string;
  text: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 ring-1 ring-inset transition-colors",
        checked ? "bg-accent/[0.07] ring-accent/35" : "bg-canvas-raised/50 ring-ink/10 hover:ring-ink/20",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon className={cn("h-4 w-4", checked ? "text-accent" : "text-ink-faint")} aria-hidden />
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">{text}</span>
      </span>
    </label>
  );
}

function Fact({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="hud-label">{label}</dt>
      <dd className={cn("text-data mt-1 truncate text-sm", good ? "text-accent" : "text-ink")}>{value}</dd>
    </div>
  );
}
