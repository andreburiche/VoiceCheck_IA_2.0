"use client";

import { corTema } from "@/lib/tema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Square, Wand2, Save } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

import { InfoHint } from "@/components/analysis/info-hint";
import { SectionPanel } from "@/components/analysis/section-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadProjectAnalysis,
  saveProjectAnalysis,
  type MusicSection,
  type ProjectAnalysisLocal,
} from "@/lib/analysis-local";
import { analyzeAudioBuffers, buildBeatGrid } from "@/lib/audio-analysis";
import { AudioEngine } from "@/lib/audio-engine";
import { assetsApi, projectsApi, studioApi, type StemRow } from "@/lib/api";
import { STEM_COLORS, STEM_ORDER, formatClock } from "@/lib/stem-theme";
import { PageSkeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";

type Props = { projectId: string };

const KEY_OPTIONS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
  "Cm",
  "C#m",
  "Dm",
  "D#m",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "A#m",
  "Bm",
];

export function AnalysisWorkspace({ projectId }: Props) {
  const qc = useQueryClient();
  const engRef = useRef<AudioEngine | null>(null);
  const waveHost = useRef<HTMLDivElement | null>(null);
  const waveRef = useRef<WaveSurfer | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [key, setKey] = useState("");
  const [chords, setChords] = useState("");
  const [timeSig, setTimeSig] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [sections, setSections] = useState<MusicSection[]>([]);
  const [beats, setBeats] = useState<number[]>([]);
  const [estimated, setEstimated] = useState({
    bpm: false,
    key: false,
    chords: false,
  });
  const [conf, setConf] = useState<{ bpm: number; key: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
  });
  const stemsQuery = useQuery({
    queryKey: ["stems", projectId],
    queryFn: () => studioApi.stems(projectId),
  });

  const latestStems = useMemo(() => {
    const items = stemsQuery.data?.items ?? [];
    const byType = new Map<string, StemRow>();
    for (const s of items) {
      if (!byType.has(s.stem_type)) byType.set(s.stem_type, s);
    }
    return STEM_ORDER.map((t) => byType.get(t)).filter(Boolean) as StemRow[];
  }, [stemsQuery.data]);

  const stemKey = latestStems.map((s) => s.asset_id).join(",");

  useEffect(() => {
    void loadProjectAnalysis(projectId).then((local) => {
      setLyrics(local.lyrics);
      setSections(local.sections);
      setTimeSig(local.time_signature ?? "");
    });
  }, [projectId]);

  useEffect(() => {
    if (project.data?.bpm) setBpm(Number(project.data.bpm));
    if (project.data?.musical_key) setKey(project.data.musical_key);
    if (project.data?.chords_hint) setChords(project.data.chords_hint);
  }, [project.data]);

  useEffect(() => {
    const eng = new AudioEngine();
    engRef.current = eng;
    eng.on("time", (t) => {
      setTime(t);
      const ws = waveRef.current;
      if (ws && Math.abs(ws.getCurrentTime() - t) > 0.05) ws.setTime(t);
    });
    eng.on("state", setPlaying);
    eng.on("ended", () => setPlaying(false));
    return () => {
      eng.dispose();
      waveRef.current?.destroy();
      waveRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!latestStems.length) {
        setReady(false);
        return;
      }
      setError(null);
      const eng = engRef.current;
      if (!eng) return;
      try {
        await eng.ensureContext();
        let guideBuf: ArrayBuffer | null = null;
        let guideType = "other";
        for (const stem of latestStems) {
          const { url } = await assetsApi.playbackUrl(stem.asset_id);
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`Falha ao carregar ${stem.stem_type}`);
          const buf = await res.arrayBuffer();
          await eng.loadStem(stem.stem_type, buf);
          eng.setChannel(stem.stem_type, { volume: 1, mute: false, solo: false });
          if (!guideBuf || stem.stem_type === "other") {
            guideBuf = buf;
            guideType = stem.stem_type;
          }
        }
        if (waveHost.current && guideBuf) {
          waveRef.current?.destroy();
          const ws = WaveSurfer.create({
            container: waveHost.current,
            waveColor: STEM_COLORS[guideType] ?? "#268BFF",
            progressColor: corTema("accent", 0.55),
            cursorColor: "#F4F6FA",
            height: 120,
            interact: true,
            dragToSeek: true,
            normalize: true,
          });
          await ws.loadBlob(new Blob([guideBuf], { type: "audio/wav" }));
          ws.on("interaction", (t) => {
            eng.seek(t);
            setTime(t);
          });
          waveRef.current = ws;
        }
        if (!cancelled) {
          const d = eng.getDuration();
          setDuration(d);
          setReady(true);
          const bpmVal = project.data?.bpm ? Number(project.data.bpm) : bpm;
          setBeats(buildBeatGrid(d, bpmVal));
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "Erro ao carregar"));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemKey]);

  useEffect(() => {
    if (duration > 0) setBeats(buildBeatGrid(duration, bpm));
  }, [bpm, duration]);

  const saveMeta = useMutation({
    mutationFn: async () => {
      await projectsApi.update(projectId, {
        bpm,
        musical_key: key || null,
        chords_hint: chords.trim() || null,
      });
      const local: ProjectAnalysisLocal = {
        projectId,
        lyrics,
        sections,
        time_signature: timeSig.trim() || null,
        updatedAt: new Date().toISOString(),
      };
      await saveProjectAnalysis(local);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      setMsg("Análise salva (metadados no servidor · letras/seções neste dispositivo).");
      setTimeout(() => setMsg(null), 4000);
    },
    onError: (e: Error) => setError(e.message),
  });

  async function runEstimate() {
    const eng = engRef.current;
    const buffers = eng?.getRawBuffers() ?? [];
    if (!buffers.length) {
      setError("Carregue as faixas antes de estimar.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const estimate = analyzeAudioBuffers(buffers);
      if (!estimate) throw new Error("Áudio insuficiente para análise.");
      setBpm(estimate.bpm);
      setKey(estimate.musical_key);
      if (estimate.chords) setChords(estimate.chords);
      setBeats(
        estimate.beat_times_sec.length
          ? estimate.beat_times_sec
          : buildBeatGrid(duration, estimate.bpm),
      );
      setEstimated({ bpm: true, key: true, chords: Boolean(estimate.chords) });
      setConf({ bpm: estimate.confidence_bpm, key: estimate.confidence_key });
      setMsg(
        `Estimativa: ${estimate.bpm} BPM · ${estimate.musical_key} (confiança BPM ${(estimate.confidence_bpm * 100).toFixed(0)}% · tom ${(estimate.confidence_key * 100).toFixed(0)}%)`,
      );
      await projectsApi.update(projectId, {
        bpm: estimate.bpm,
        musical_key: estimate.musical_key,
        chords_hint: estimate.chords || null,
      });
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
    } catch (e) {
      setError(friendlyError(e, "Falha na estimativa"));
    } finally {
      setAnalyzing(false);
    }
  }

  function seek(t: number) {
    engRef.current?.seek(t);
    setTime(t);
    waveRef.current?.setTime(t);
  }

  function togglePlay() {
    const eng = engRef.current;
    if (!eng || !ready) return;
    if (playing) eng.pause();
    else void eng.play();
  }

  function stop() {
    engRef.current?.pause();
    setPlaying(false);
    seek(0);
  }

  if (project.isLoading || stemsQuery.isLoading) {
    return <PageSkeleton label="Carregando análise…" />;
  }

  if (!latestStems.length) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-canvas-raised p-6">
        <h1 className="font-display text-xl font-semibold text-ink">Análise musical</h1>
        <p className="text-sm text-ink-muted">
          Separe a faixa em stems para analisar BPM, tonalidade e acordes a partir do áudio real.
        </p>
        <Link href={`/projects/${projectId}#separacao`} className="text-sm text-accent hover:underline">
          Ir para a separação
        </Link>
      </div>
    );
  }

  const beatStep = Math.max(1, Math.ceil(beats.length / 64));

  return (
    <div className="page-shell space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
            Análise musical
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            BPM, tom e acordes estimados automaticamente a partir do áudio. Revise e corrija o que
            não bater com o que você ouve.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!ready || analyzing}
            onClick={() => void runEstimate()}
          >
            <Wand2 className="mr-1.5 h-4 w-4" aria-hidden />
            {analyzing ? "Estimando…" : "Estimar do áudio"}
          </Button>
          <Button type="button" disabled={saveMeta.isPending} onClick={() => saveMeta.mutate()}>
            <Save className="mr-1.5 h-4 w-4" aria-hidden />
            Salvar
          </Button>
        </div>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-signal-err">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p role="status" className="text-sm text-accent">
          {msg}
        </p>
      ) : null}

      <section
        className="grid gap-3 rounded-2xl border border-line bg-canvas-raised/90 p-4 shadow-panel sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Métricas da análise"
      >
        <Metric
          label="BPM"
          hint="Estimativa por autocorrelação do envelope. Edite se o metrônomo não bater."
          estimated={estimated.bpm}
          conf={conf?.bpm}
        >
          <Input
            id="ana-bpm"
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => {
              setBpm(Number(e.target.value));
              setEstimated((s) => ({ ...s, bpm: false }));
            }}
            className="h-9 font-mono text-lg"
            aria-label="BPM"
          />
        </Metric>
        <Metric
          label="Tonalidade"
          hint="Estimativa por perfil cromático (Krumhansl-Schmuckler). Confira no instrumento."
          estimated={estimated.key}
          conf={conf?.key}
        >
          <select
            id="ana-key"
            className="h-9 w-full rounded-lg border border-line bg-canvas px-2 text-sm text-ink"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setEstimated((s) => ({ ...s, key: false }));
            }}
            aria-label="Tonalidade"
          >
            <option value="">—</option>
            {KEY_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Metric>
        <Metric label="Duração" hint="Duração real das faixas carregadas." estimated={false}>
          <p className="font-mono text-lg text-ink">{formatClock(duration)}</p>
        </Metric>
        <Metric
          label="Compasso"
          hint="Detecção automática de compasso não está disponível. Informe manualmente (ex.: 4/4)."
          estimated={false}
          unavailable={!timeSig}
          unavailableLabel="Indisponível (auto)"
        >
          <Input
            id="ana-ts"
            placeholder="ex.: 4/4"
            value={timeSig}
            onChange={(e) => setTimeSig(e.target.value)}
            className="h-9"
            aria-label="Compasso"
          />
        </Metric>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-canvas-raised/90 p-4 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            Waveform
            <InfoHint label="waveform">
              Visualização do mix de stems. Linhas verticais = grade de batidas estimada a partir do
              BPM (não onset detection). Faixas coloridas = seções que você definiu.
            </InfoHint>
          </h2>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={!ready} onClick={togglePlay} aria-pressed={playing}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="ml-1.5">{playing ? "Pausar" : "Tocar"}</span>
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={!ready} onClick={stop}>
              <Square className="h-4 w-4" />
            </Button>
            <span className="font-mono text-xs text-ink-muted">
              {formatClock(time)} / {formatClock(duration)}
            </span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-line bg-canvas">
          {duration > 0 &&
            sections.map((s) => (
              <div
                key={s.id}
                className="pointer-events-none absolute inset-y-0 z-[1] border-l border-r border-violet/40 bg-violet/10"
                style={{
                  left: `${(s.start_sec / duration) * 100}%`,
                  width: `${(Math.max(0, s.end_sec - s.start_sec) / duration) * 100}%`,
                }}
                title={`${s.label} ${s.start_sec.toFixed(1)}–${s.end_sec.toFixed(1)}s`}
              />
            ))}
          {duration > 0 &&
            beats
              .filter((_, i) => i % beatStep === 0)
              .map((t) => (
                <div
                  key={t}
                  className="pointer-events-none absolute inset-y-0 z-[2] w-px bg-accent/25"
                  style={{ left: `${(t / duration) * 100}%` }}
                />
              ))}
          <div ref={waveHost} className="relative z-[3] min-h-[120px] w-full px-1" />
        </div>
        <p className="text-xs text-ink-faint">
          As marcas de batida seguem uma grade estimada pelo BPM.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionPanel
          sections={sections}
          duration={duration}
          currentTime={time}
          onChange={setSections}
          onSeek={seek}
        />

        <section className="space-y-3 rounded-2xl border border-line bg-canvas-raised/90 p-4 shadow-panel">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            Acordes estimados
            <InfoHint label="acordes">
              Progressão aproximada por janelas de ~1 compasso (chroma). Edite livremente; salve no
              projeto.
            </InfoHint>
            {estimated.chords ? (
              <span className="rounded-md bg-violet/20 px-1.5 py-0.5 text-xs font-medium text-violet">
                Estimado
              </span>
            ) : null}
          </h2>
          <Label htmlFor="ana-chords" className="sr-only">
            Acordes
          </Label>
          <Input
            id="ana-chords"
            value={chords}
            placeholder="ex.: Am F C G"
            onChange={(e) => {
              setChords(e.target.value);
              setEstimated((s) => ({ ...s, chords: false }));
            }}
          />
          <p className="text-xs text-ink-faint">Separados por espaço. Não substitui orelha musical.</p>

          <h2 className="flex items-center gap-1.5 pt-2 text-sm font-semibold text-ink">
            Letras
            <InfoHint label="letras">
              Fornecidas por você — não há reconhecimento automático de letra neste produto.
            </InfoHint>
          </h2>
          <Label htmlFor="ana-lyrics" className="sr-only">
            Letras
          </Label>
          <textarea
            id="ana-lyrics"
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            rows={10}
            placeholder="Cole ou digite a letra aqui…"
            className="w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <p className="text-xs text-ink-faint">
            Salvas neste dispositivo (IndexedDB). Transcrição automática:{" "}
            <span className="text-ink-muted">indisponível</span>
          </p>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  hint,
  estimated,
  conf,
  unavailable,
  unavailableLabel,
  children,
}: {
  label: string;
  hint: string;
  estimated: boolean;
  conf?: number;
  unavailable?: boolean;
  unavailableLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas/50 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <Label className="flex items-center gap-1 text-xs text-ink-faint">
          {label}
          <InfoHint label={label.toLowerCase()}>{hint}</InfoHint>
        </Label>
        {estimated ? (
          <span className="rounded-md bg-violet/20 px-1.5 py-0.5 text-xs font-medium text-violet">
            Estimado{conf != null ? ` · ${(conf * 100).toFixed(0)}%` : ""}
          </span>
        ) : unavailable ? (
          <span className="rounded-md bg-canvas-overlay px-1.5 py-0.5 text-xs font-medium text-ink-faint">
            {unavailableLabel ?? "Indisponível"}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
