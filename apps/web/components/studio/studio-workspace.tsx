"use client";

import { corTema } from "@/lib/tema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

import { StudioHeader } from "@/components/studio/studio-header";
import { StudioSidePanel } from "@/components/studio/studio-side-panel";
import { StudioToolbar } from "@/components/studio/studio-toolbar";
import { TrackLane } from "@/components/studio/track-lane";
import { TransportBar } from "@/components/studio/transport-bar";
import { loadAppSettings } from "@/lib/app-settings";
import { AudioEngine } from "@/lib/audio-engine";
import { defaultEqState, normalizeEqState, type EqState } from "@/lib/eq";
import { defaultFxState, normalizeFxState, type FxState } from "@/lib/fx";
import {
  assetsApi,
  projectsApi,
  separationsApi,
  studioApi,
  type StemMixState,
  type StemRow,
} from "@/lib/api";
import { STEM_COLORS, STEM_ORDER, formatClock } from "@/lib/stem-theme";
import { PageSkeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";
import { TRANSPORT_SHORTCUTS_HINT, useTransportShortcuts } from "@/lib/use-transport-shortcuts";

type Props = { projectId: string };

const BASE_PX_PER_SEC = 48;

export function StudioWorkspace({ projectId }: Props) {
  const qc = useQueryClient();
  const engineRef = useRef<AudioEngine | null>(null);
  const waveRefs = useRef<Map<string, WaveSurfer>>(new Map());
  const waveHosts = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mix, setMix] = useState<Record<string, StemMixState>>({});
  const [master, setMaster] = useState(() => loadAppSettings().defaultVolume);
  const [eq, setEq] = useState<EqState>(() => defaultEqState());
  const [fx, setFx] = useState<FxState>(() => defaultFxState());
  const [speedPct, setSpeedPct] = useState(100);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  const [metroOn, setMetroOn] = useState(false);
  const [metroBpm, setMetroBpm] = useState(120);
  const [zoom, setZoom] = useState(1);
  const [loopOn, setLoopOn] = useState(false);
  const [loopA, setLoopA] = useState(0);
  const [loopB, setLoopB] = useState(8);
  const [sideOpen, setSideOpen] = useState(true);
  const [viewportW, setViewportW] = useState(800);
  const [stemsJobId, setStemsJobId] = useState<string | null>(null);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
  });
  const stemsQuery = useQuery({
    queryKey: ["stems", projectId, stemsJobId],
    queryFn: () => studioApi.stems(projectId, stemsJobId ?? undefined),
  });
  const mixQuery = useQuery({
    queryKey: ["mix", projectId],
    queryFn: () => studioApi.getMix(projectId),
  });
  const markers = useQuery({
    queryKey: ["markers", projectId],
    queryFn: () => studioApi.markers(projectId),
  });
  const jobsQuery = useQuery({
    queryKey: ["separations", projectId],
    queryFn: () => separationsApi.list(projectId),
  });

  const latestStems = useMemo(() => {
    const items = stemsQuery.data?.items ?? [];
    const byType = new Map<string, StemRow>();
    for (const s of [...items].sort((a, b) => b.order_index - a.order_index)) {
      if (!byType.has(s.stem_type)) byType.set(s.stem_type, s);
    }
    return STEM_ORDER.map((t) => byType.get(t)).filter(Boolean) as StemRow[];
  }, [stemsQuery.data]);

  const jobOptions = useMemo(() => {
    const items = (jobsQuery.data?.items ?? []).filter((j) => j.status === "completed");
    return items.map((j) => ({
      id: j.id,
      label: `${j.model_code ?? "modelo"} · ${new Date(j.created_at).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    }));
  }, [jobsQuery.data]);

  const waveWidthPx = useMemo(() => {
    const content = Math.max(duration, 1) * BASE_PX_PER_SEC * zoom;
    return Math.max(content, viewportW - 208);
  }, [duration, zoom, viewportW]);

  useEffect(() => {
    if (mixQuery.data?.state) {
      setMix(mixQuery.data.state.stems ?? {});
      setMaster(mixQuery.data.state.master_gain ?? 1);
      setEq(normalizeEqState(mixQuery.data.state.eq));
      setFx(normalizeFxState(mixQuery.data.state.fx));
    }
  }, [mixQuery.data]);

  useEffect(() => {
    if (project.data?.bpm) setMetroBpm(Number(project.data.bpm));
  }, [project.data?.bpm]);

  useEffect(() => {
    const eng = new AudioEngine();
    engineRef.current = eng;
    let lastUi = 0;
    eng.on("time", (t) => {
      const now = performance.now();
      if (now - lastUi < 80) return;
      lastUi = now;
      setTime(t);
    });
    eng.on("state", setPlaying);
    eng.on("ended", () => setPlaying(false));
    return () => {
      eng.dispose();
      for (const ws of waveRefs.current.values()) ws.destroy();
      waveRefs.current.clear();
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setViewportW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!latestStems.length) {
        setReady(false);
        return;
      }
      setError(null);
      setReady(false);
      const eng = engineRef.current;
      if (!eng) return;
      try {
        await eng.ensureContext();
        eng.clearStems();
        for (const ws of waveRefs.current.values()) ws.destroy();
        waveRefs.current.clear();
        for (const stem of latestStems) {
          const { url } = await assetsApi.playbackUrl(stem.asset_id);
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`Falha ao baixar stem ${stem.stem_type}`);
          const buf = await res.arrayBuffer();
          await eng.loadStem(stem.stem_type, buf);

          const host = waveHosts.current.get(stem.stem_type);
          if (host) {
            waveRefs.current.get(stem.stem_type)?.destroy();
            const ws = WaveSurfer.create({
              container: host,
              waveColor: STEM_COLORS[stem.stem_type] ?? "#888",
              progressColor: corTema("ink", 0.35),
              cursorColor: "transparent",
              height: 64,
              interact: true,
              dragToSeek: true,
              normalize: true,
              minPxPerSec: BASE_PX_PER_SEC * zoom,
              fillParent: false,
            });
            await ws.loadBlob(new Blob([buf], { type: "audio/wav" }));
            ws.on("interaction", (t) => {
              eng.seek(t);
              setTime(t);
            });
            waveRefs.current.set(stem.stem_type, ws);
          }

          const cfg = mix[stem.stem_type] ?? { volume: 1, mute: false, solo: false, pan: 0 };
          eng.setChannel(stem.stem_type, cfg);
        }
        eng.setMasterGain(master);
        eng.setEq(eq);
        eng.setFx(fx);
        eng.setMetronome(metroOn, metroBpm);
        if (!cancelled) {
          setDuration(eng.getDuration());
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "Não foi possível carregar as faixas."));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestStems.map((s) => s.asset_id).join(",")]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    for (const [id, cfg] of Object.entries(mix)) eng.setChannel(id, cfg);
    eng.applyAllChannels();
    eng.setMasterGain(master);
  }, [mix, master]);

  useEffect(() => {
    engineRef.current?.setEq(eq);
  }, [eq]);

  useEffect(() => {
    engineRef.current?.setFx(fx);
  }, [fx]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setMetronome(metroOn, metroBpm);
  }, [metroOn, metroBpm]);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (loopOn && loopB > loopA) eng.setLoop({ start: loopA, end: loopB });
    else eng.setLoop(null);
  }, [loopOn, loopA, loopB]);

  useEffect(() => {
    for (const ws of waveRefs.current.values()) {
      try {
        ws.zoom(BASE_PX_PER_SEC * zoom);
      } catch {
        /* wavesurfer pode não ter buffer ainda */
      }
    }
  }, [zoom]);

  // Não chamar ws.seekTo a cada frame — congela a UI (WaveSurfer redraw).
  // O playhead CSS já acompanha `time`.

  const saveMix = useMutation({
    mutationFn: () =>
      studioApi.putMix(projectId, {
        name: "Padrão",
        is_default: true,
        state: { stems: mix, master_gain: master, eq, fx },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mix", projectId] }),
  });

  useEffect(() => {
    if (!ready || !Object.keys(mix).length) return;
    const t = setTimeout(() => saveMix.mutate(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mix, master, eq, fx, ready]);

  const addMarker = useMutation({
    mutationFn: () =>
      studioApi.createMarker(projectId, {
        position_ms: Math.round(time * 1000),
        label: `Marca ${formatClock(time)}`,
        color: "#20D9D2",
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["markers", projectId] }),
  });

  const deleteMarker = useMutation({
    mutationFn: (markerId: string) => studioApi.deleteMarker(projectId, markerId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["markers", projectId] }),
  });

  const saveLoop = useMutation({
    mutationFn: () =>
      studioApi.createLoop(projectId, {
        name: `Loop ${loopA.toFixed(1)}-${loopB.toFixed(1)}`,
        start_ms: Math.round(loopA * 1000),
        end_ms: Math.round(loopB * 1000),
      }),
  });

  function updateStem(type: string, patch: Partial<StemMixState>) {
    setMix((prev) => ({
      ...prev,
      [type]: {
        volume: prev[type]?.volume ?? 1,
        mute: prev[type]?.mute ?? false,
        solo: prev[type]?.solo ?? false,
        pan: prev[type]?.pan ?? 0,
        ...patch,
      },
    }));
  }

  async function togglePlay() {
    const eng = engineRef.current;
    if (!eng || !ready) return;
    try {
      if (eng.isPlaying()) eng.pause();
      else await eng.play();
    } catch (e) {
      setError(friendlyError(e, "Autoplay bloqueado — interaja com a página"));
    }
  }

  function stop() {
    engineRef.current?.pause();
    engineRef.current?.seek(0);
    setTime(0);
  }

  const seek = useCallback((seconds: number) => {
    engineRef.current?.seek(seconds);
    setTime(seconds);
  }, []);

  useTransportShortcuts({
    enabled: ready,
    onTogglePlay: () => void togglePlay(),
    onStop: stop,
    onToggleLoop: () => setLoopOn((v) => !v),
    onSeekBy: (d) => seek(Math.min(Math.max(0, time + d), duration || time + d)),
  });

  async function changeSpeed(pct: number) {
    setSpeedPct(pct);
    try {
      await engineRef.current?.setSpeedPct(pct);
    } catch (e) {
      setError(friendlyError(e, "Falha ao alterar velocidade"));
    }
  }

  async function changePitch(semitones: number) {
    setPitchSemitones(semitones);
    try {
      await engineRef.current?.setPitchSemitones(semitones);
    } catch (e) {
      setError(friendlyError(e, "Falha ao alterar tom"));
    }
  }

  const playheadRatio = duration > 0 ? time / duration : 0;
  const loopStartRatio = duration > 0 ? loopA / duration : 0;
  const loopEndRatio = duration > 0 ? loopB / duration : 0;
  const playheadLeft = playheadRatio * waveWidthPx;
  const loopLeft = loopStartRatio * waveWidthPx;
  const loopWidth = Math.max(0, loopEndRatio - loopStartRatio) * waveWidthPx;

  if (stemsQuery.isLoading) {
    return <PageSkeleton className="p-4 md:p-6" label="Carregando faixas…" />;
  }

  if (!latestStems.length) {
    return (
      <div className="m-6 rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-faint">
        Nenhum stem neste projeto. Conclua uma separação antes de abrir o estúdio.
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-canvas text-ink">
      <StudioHeader
        projectId={projectId}
        title={project.data?.name ?? "Estúdio"}
        artist={project.data?.description}
        bpm={project.data?.bpm}
        musicalKey={project.data?.musical_key}
        durationSec={duration}
        stemCount={latestStems.length}
        saving={saveMix.isPending}
        onSave={() => saveMix.mutate()}
      />

      <TransportBar
        ready={ready}
        playing={playing}
        time={time}
        duration={duration}
        speedPct={speedPct}
        pitchSemitones={pitchSemitones}
        metronomeOn={metroOn}
        metronomeBpm={metroBpm}
        onPlayPause={() => void togglePlay()}
        onStop={stop}
        onSeekStart={() => seek(loopOn ? loopA : 0)}
        onSeek={seek}
        onSpeed={(p) => void changeSpeed(p)}
        onPitch={(p) => void changePitch(p)}
        onToggleMetronome={() => setMetroOn((v) => !v)}
        onBpm={setMetroBpm}
      />

      {error ? (
        <p role="alert" className="border-b border-signal-err/30 bg-signal-err/10 px-4 py-2 text-sm text-signal-err">
          {error}
        </p>
      ) : null}
      {!ready ? (
        <p className="border-b border-line px-4 py-2 text-xs text-signal-meter">Preparando as faixas…</p>
      ) : null}
      {ready ? (
        <p className="hidden border-b border-line/60 px-4 py-1.5 text-xs text-ink-faint lg:block">{TRANSPORT_SHORTCUTS_HINT}</p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <div className="flex min-w-max flex-col">
              {/* Régua + playhead compartilhado */}
              <div className="sticky top-0 z-10 flex border-b border-line bg-canvas-raised/95">
                <div className="w-44 shrink-0 border-r border-line px-2 py-2 text-xs text-ink-faint md:w-52">
                  Faixas
                </div>
                <div className="relative h-8" style={{ width: waveWidthPx }}>
                  {loopOn && loopB > loopA ? (
                    <div
                      className="absolute inset-y-0 bg-accent/10"
                      style={{ left: loopLeft, width: loopWidth }}
                      aria-hidden
                    />
                  ) : null}
                  {(markers.data ?? []).map((m) => {
                    const x = duration > 0 ? (m.position_ms / 1000 / duration) * waveWidthPx : 0;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="absolute top-0 h-full w-0.5 bg-violet"
                        style={{ left: x }}
                        title={m.label}
                        aria-label={`Marcador ${m.label}`}
                        onClick={() => seek(m.position_ms / 1000)}
                      />
                    );
                  })}
                  <div
                    className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-ink"
                    style={{ left: playheadLeft }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    className="absolute inset-0 cursor-crosshair"
                    aria-label="Posição na música"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const ratio = (e.clientX - rect.left) / rect.width;
                      seek(ratio * duration);
                    }}
                  />
                </div>
              </div>

              {STEM_ORDER.map((type) => {
                const stem = latestStems.find((s) => s.stem_type === type);
                if (!stem) return null;
                const cfg = mix[type] ?? { volume: 1, mute: false, solo: false, pan: 0 };
                return (
                  <TrackLane
                    key={type}
                    stemType={type}
                    cfg={cfg}
                    waveWidthPx={waveWidthPx}
                    playheadRatio={playheadRatio}
                    loopOn={loopOn}
                    loopStartRatio={loopStartRatio}
                    loopEndRatio={loopEndRatio}
                    onChange={(patch) => updateStem(type, patch)}
                    waveRef={(el) => {
                      if (el) waveHosts.current.set(type, el);
                    }}
                  />
                );
              })}
            </div>
          </div>

          <StudioToolbar
            zoom={zoom}
            loopOn={loopOn}
            loopA={loopA}
            loopB={loopB}
            sideOpen={sideOpen}
            onZoomIn={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
            onZoomOut={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
            onSetA={() => setLoopA(Number(time.toFixed(2)))}
            onSetB={() => setLoopB(Number(Math.max(time, loopA + 0.1).toFixed(2)))}
            onToggleLoop={() => setLoopOn((v) => !v)}
            onAddMarker={() => addMarker.mutate()}
            onToggleSide={() => setSideOpen((v) => !v)}
          />
        </div>

        <StudioSidePanel
          open={sideOpen}
          master={master}
          onMaster={setMaster}
          eq={eq}
          onEqChange={setEq}
          fx={fx}
          onFxChange={setFx}
          markers={markers.data ?? []}
          onSeekMarker={seek}
          onDeleteMarker={(id) => deleteMarker.mutate(id)}
          loopOn={loopOn}
          loopA={loopA}
          loopB={loopB}
          onSaveLoop={() => saveLoop.mutate()}
          saveLoopPending={saveLoop.isPending}
          jobOptions={jobOptions}
          selectedJobId={stemsJobId}
          onSelectJob={setStemsJobId}
        />
      </div>
    </div>
  );
}
