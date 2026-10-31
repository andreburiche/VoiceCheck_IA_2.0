"use client";

import { corTema } from "@/lib/tema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkPlus,
  Pause,
  Play,
  Repeat,
  Save,
  Square,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";

import { InstrumentPicker } from "@/components/practice/instrument-picker";
import { LyricsPanel } from "@/components/practice/lyrics-panel";
import { PracticeCoachPanel } from "@/components/practice/practice-coach-panel";
import { PracticePitchPanel } from "@/components/practice/practice-pitch-panel";
import { PracticeRecorder } from "@/components/practice/practice-recorder";
import { PracticeRoomHeader } from "@/components/practice/practice-room-header";
import { PracticeScrubber } from "@/components/practice/practice-scrubber";
import { SongSectionsPanel } from "@/components/practice/song-sections-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { analyzeAudioBuffers } from "@/lib/audio-analysis";
import { extractPeaks } from "@/lib/audio-peaks";
import { AudioEngine } from "@/lib/audio-engine";
import {
  assetsApi,
  practiceApi,
  projectsApi,
  studioApi,
  vocalApi,
  type StemRow,
} from "@/lib/api";
import {
  deletePracticePreset,
  listPracticePresets,
  savePracticePreset,
  type PracticePreset,
} from "@/lib/practice-presets";
import {
  getPracticeProfile,
  mixForProfile,
  mutedStemForProfile,
  type PracticeProfileId,
} from "@/lib/practice-profiles";
import {
  analyzePracticeTake,
  type PracticePitchAnalysis,
} from "@/lib/practice-pitch-analysis";
import {
  getPracticeTakeBlob,
  listPracticeTakes,
} from "@/lib/practice-recordings";
import {
  decodeTakePeaks,
  placePeaksOnTimeline,
} from "@/lib/practice-voice-peaks";
import { decodeArrayBuffer } from "@/lib/vocal-dsp";
import { STEM_ORDER, formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";
import { TRANSPORT_SHORTCUTS_HINT, useTransportShortcuts } from "@/lib/use-transport-shortcuts";
import { friendlyError } from "@/lib/errors";
import { useConfirm } from "@/components/ui/use-confirm";

type Props = { projectId: string };
type TabId = "treino" | "afinacao" | "letras" | "secoes" | "mais";

function toApiProfile(id: PracticeProfileId): string {
  return id === "acoustic" ? "guitar" : id;
}

function yieldToMain() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

export function PracticeWorkspace({ projectId }: Props) {
  const [confirmDialog, confirm] = useConfirm();
  const qc = useQueryClient();
  const engRef = useRef<AudioEngine | null>(null);
  const sessionStarted = useRef<number | null>(null);
  const lastUiMs = useRef(0);
  const txGen = useRef(0);

  const [tab, setTab] = useState<TabId>("treino");
  const [coachTab, setCoachTab] = useState<"feedback" | "historico">("feedback");
  const [profile, setProfile] = useState<PracticeProfileId>("singer");
  const [ready, setReady] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [bpm, setBpm] = useState(120);
  const [key, setKey] = useState("");
  const [chords, setChords] = useState("");
  const [metroOn, setMetroOn] = useState(true);
  const [countIn, setCountIn] = useState(true);
  const [loopOn, setLoopOn] = useState(false);
  const [loopA, setLoopA] = useState(0);
  const [loopB, setLoopB] = useState(8);
  const [notes, setNotes] = useState("");
  const [speedPct, setSpeedPct] = useState(100);
  const [pitchSemitones, setPitchSemitones] = useState(0);
  /** Valores do slider enquanto arrasta — só aplica no engine ao soltar. */
  const [draftSpeed, setDraftSpeed] = useState(100);
  const [draftPitch, setDraftPitch] = useState(0);
  const [instrumentMuted, setInstrumentMuted] = useState(true);
  const [processingTx, setProcessingTx] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [presets, setPresets] = useState<PracticePreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [voicePeaks, setVoicePeaks] = useState<Float32Array | null>(null);
  const [overlayTakeId, setOverlayTakeId] = useState<string | null>(null);
  const [voiceOverlayLabel, setVoiceOverlayLabel] = useState<string | null>(null);
  const [pitchAnalysis, setPitchAnalysis] = useState<PracticePitchAnalysis | null>(null);
  const [pitchAnalyzing, setPitchAnalyzing] = useState(false);
  const [pitchError, setPitchError] = useState<string | null>(null);
  const [toleranceCents, setToleranceCents] = useState(50);
  const vocalsBufRef = useRef<AudioBuffer | null>(null);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
  });
  const stemsQuery = useQuery({
    queryKey: ["stems", projectId],
    queryFn: () => studioApi.stems(projectId),
  });
  const vocalList = useQuery({
    queryKey: ["vocal-tx", projectId],
    queryFn: () => vocalApi.list(projectId),
  });
  const history = useQuery({
    queryKey: ["practice", projectId],
    queryFn: () => practiceApi.list(projectId),
  });
  const markers = useQuery({
    queryKey: ["markers", projectId],
    queryFn: () => studioApi.markers(projectId),
  });
  const loops = useQuery({
    queryKey: ["loops", projectId],
    queryFn: () => studioApi.loops(projectId),
  });

  const profileMeta = getPracticeProfile(profile);
  const muteTarget = mutedStemForProfile(profile);

  const latestStems = useMemo(() => {
    const items = stemsQuery.data?.items ?? [];
    const byType = new Map<string, StemRow>();
    for (const s of items) {
      if (!byType.has(s.stem_type)) byType.set(s.stem_type, s);
    }
    return STEM_ORDER.map((t) => byType.get(t)).filter(Boolean) as StemRow[];
  }, [stemsQuery.data]);

  const availableStemTypes = useMemo(
    () => new Set(latestStems.map((s) => s.stem_type)),
    [latestStems],
  );
  const stemForMuteExists = muteTarget ? availableStemTypes.has(muteTarget) : true;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#letras") setTab("letras");
  }, []);

  useEffect(() => {
    void listPracticePresets(projectId).then(setPresets);
  }, [projectId]);

  useEffect(() => {
    vocalsBufRef.current = null;
    setPitchAnalysis(null);
    setPitchError(null);
  }, [projectId]);

  useEffect(() => {
    if (project.data?.bpm) setBpm(Number(project.data.bpm));
    if (project.data?.musical_key) setKey(project.data.musical_key);
    if (project.data?.chords_hint) setChords(project.data.chords_hint);
  }, [project.data]);

  const loadVoiceOverlay = useCallback(
    async (takeId?: string | null) => {
      if (!ready || duration <= 0) {
        setVoicePeaks(null);
        setVoiceOverlayLabel(null);
        return;
      }
      const takes = await listPracticeTakes(projectId);
      const take =
        (takeId ? takes.find((t) => t.id === takeId) : null) ??
        (overlayTakeId ? takes.find((t) => t.id === overlayTakeId) : null) ??
        takes[0] ??
        null;
      if (!take) {
        setVoicePeaks(null);
        setOverlayTakeId(null);
        setVoiceOverlayLabel(null);
        return;
      }
      const blob = await getPracticeTakeBlob(take.id);
      if (!blob) {
        setVoicePeaks(null);
        return;
      }
      const decoded = await decodeTakePeaks(blob, 800);
      if (!decoded) {
        setVoicePeaks(null);
        return;
      }
      const takeDur = Math.max(decoded.durationSec, take.durationMs / 1000);
      const placed = placePeaksOnTimeline(
        decoded.peaks,
        take.offsetSec ?? 0,
        takeDur,
        duration,
        800,
      );
      setVoicePeaks(placed);
      setOverlayTakeId(take.id);
      setVoiceOverlayLabel(
        `${take.label}${typeof take.offsetSec === "number" ? ` @ ${formatClock(take.offsetSec)}` : ""}`,
      );
    },
    [projectId, ready, duration, overlayTakeId],
  );

  useEffect(() => {
    if (!ready || duration <= 0) return;
    void loadVoiceOverlay(overlayTakeId);
    // Só na carga inicial do player / mudança de duração
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, duration, projectId]);

  const runPitchAnalysis = useCallback(async () => {
    setPitchError(null);
    setPitchAnalyzing(true);
    try {
      const takes = await listPracticeTakes(projectId);
      const take =
        (overlayTakeId ? takes.find((t) => t.id === overlayTakeId) : null) ?? takes[0] ?? null;
      if (!take) throw new Error("Grave um ensaio antes de analisar");
      const blob = await getPracticeTakeBlob(take.id);
      if (!blob) throw new Error("Áudio do ensaio não encontrado");

      const ctx = new AudioContext();
      let takeBuf: AudioBuffer;
      try {
        takeBuf = await decodeArrayBuffer(ctx, await blob.arrayBuffer());
      } finally {
        await ctx.close().catch(() => undefined);
      }

      // Lab notes (preferência) ou stem vocals
      const labParts = vocalList.data?.items ?? [];
      const labNotes =
        labParts
          .flatMap((tx) => tx.parts.flatMap((p) => p.notes))
          .filter((n) => n.end_ms > n.start_ms)
          .map((n) => ({
            pitch_midi: n.pitch_midi,
            start_ms: n.start_ms,
            end_ms: n.end_ms,
          })) ?? [];

      let refBuffer = vocalsBufRef.current;
      if (!refBuffer && !labNotes.length) {
        const vocals = latestStems.find((s) => s.stem_type === "vocals");
        if (!vocals) {
          throw new Error(
            "Sem referência: separe as faixas desta música ou transcreva a voz no Laboratório vocal.",
          );
        }
        const { url } = await assetsApi.playbackUrl(vocals.asset_id);
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Não foi possível carregar a voz de referência.");
        const ab = await res.arrayBuffer();
        const ctx2 = new AudioContext();
        try {
          refBuffer = await decodeArrayBuffer(ctx2, ab);
          vocalsBufRef.current = refBuffer;
        } finally {
          await ctx2.close().catch(() => undefined);
        }
      }

      await yieldToMain();
      const result = analyzePracticeTake({
        takeBuffer: takeBuf,
        refBuffer: labNotes.length ? null : refBuffer,
        labNotes: labNotes.length ? labNotes : null,
        takeOffsetSec: take.offsetSec ?? 0,
        toleranceCents,
      });
      if (result.voicedFrames < 8) {
        throw new Error(
          "Pouca voz detectada na gravação — grave mais perto do microfone ou um trecho com notas sustentadas.",
        );
      }
      setPitchAnalysis(result);
      setOverlayTakeId(take.id);
      setTab("afinacao");
      setCoachTab("feedback");
      setMsg(
        `Afinação: ${result.inTolerancePct ?? "—"}% na tolerância · ${result.pitchEvents.length} desvios · ${result.rhythmEvents.length} ritmo`,
      );
    } catch (e) {
      setPitchAnalysis(null);
      setPitchError(friendlyError(e, "Falha na análise"));
    } finally {
      setPitchAnalyzing(false);
    }
  }, [
    projectId,
    overlayTakeId,
    vocalList.data,
    latestStems,
    toleranceCents,
  ]);

  useEffect(() => {
    const eng = new AudioEngine();
    engRef.current = eng;
    eng.on("time", (t) => {
      const now = performance.now();
      if (now - lastUiMs.current < 80) return;
      lastUiMs.current = now;
      setTime(t);
    });
    eng.on("state", setPlaying);
    eng.on("ended", () => setPlaying(false));
    return () => {
      eng.dispose();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!latestStems.length) {
        setReady(false);
        setPeaks(null);
        return;
      }
      setError(null);
      setReady(false);
      setLoadPct(0);
      const eng = engRef.current;
      if (!eng) return;
      try {
        await eng.ensureContext();
        eng.clearStems();
        const n = latestStems.length;
        let guidePeaks: Float32Array | null = null;
        for (let i = 0; i < n; i++) {
          if (cancelled) return;
          const stem = latestStems[i]!;
          const { url } = await assetsApi.playbackUrl(stem.asset_id);
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error(`Falha ao carregar ${stem.stem_type}`);
          const buf = await res.arrayBuffer();
          await eng.loadStem(stem.stem_type, buf);
          await yieldToMain();
          if (!guidePeaks) {
            const raw = eng.getRawBuffers();
            const first = raw[0];
            if (first) guidePeaks = extractPeaks(first);
          }
          if (!cancelled) setLoadPct(Math.round(((i + 1) / n) * 100));
        }
        if (cancelled) return;
        applyMix(eng, profile, instrumentMuted);
        setPeaks(guidePeaks);
        setDuration(eng.getDuration());
        setReady(true);
        setLoadPct(100);
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "Erro ao carregar"));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestStems.map((s) => s.asset_id).join(",")]);

  useEffect(() => {
    const eng = engRef.current;
    if (!eng || !ready) return;
    applyMix(eng, profile, instrumentMuted);
  }, [profile, instrumentMuted, ready]);

  useEffect(() => {
    setInstrumentMuted(profileMeta.mute.length > 0);
  }, [profile, profileMeta.mute.length]);

  useEffect(() => {
    const eng = engRef.current;
    if (!eng) return;
    eng.setMetronome(metroOn, bpm);
    if (loopOn && loopB > loopA) eng.setLoop({ start: loopA, end: loopB });
    else eng.setLoop(null);
  }, [metroOn, bpm, loopOn, loopA, loopB]);

  useEffect(() => {
    const eng = engRef.current;
    if (!eng || !ready) return;
    const gen = ++txGen.current;
    setProcessingTx(true);
    setMsg("Aplicando velocidade/tom…");
    void (async () => {
      try {
        await eng.setSpeedPct(speedPct);
        await eng.setPitchSemitones(pitchSemitones);
        if (txGen.current === gen) setMsg("Velocidade/tom aplicados");
      } catch (e) {
        if (txGen.current === gen) {
          setError(friendlyError(e, "Falha ao aplicar"));
        }
      } finally {
        // Só a operação mais recente libera o estado (evita ficar cinza pra sempre)
        if (txGen.current === gen) setProcessingTx(false);
      }
    })();
  }, [speedPct, pitchSemitones, ready]);

  function commitSpeed(e: SyntheticEvent<HTMLInputElement>) {
    const v = Number(e.currentTarget.value);
    setDraftSpeed(v);
    setSpeedPct(v);
  }
  function commitPitch(e: SyntheticEvent<HTMLInputElement>) {
    const v = Number(e.currentTarget.value);
    setDraftPitch(v);
    setPitchSemitones(v);
  }

  const saveSession = useMutation({
    mutationFn: () => {
      const elapsed =
        sessionStarted.current != null
          ? Math.max(1, Math.round((Date.now() - sessionStarted.current) / 1000))
          : Math.max(1, Math.round(time));
      const noteParts = [
        profile === "acoustic" ? "[Violão]" : null,
        notes.trim() || null,
      ].filter(Boolean);
      return practiceApi.create(projectId, {
        profile: toApiProfile(profile),
        notes: noteParts.join(" ") || undefined,
        duration_sec: elapsed,
        metronome_bpm: bpm,
        speed_pct: speedPct,
      });
    },
    onSuccess: () => {
      setMsg("Sessão registrada");
      sessionStarted.current = Date.now();
      void qc.invalidateQueries({ queryKey: ["practice", projectId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const addMarker = useMutation({
    mutationFn: () =>
      studioApi.createMarker(projectId, {
        position_ms: Math.round(time * 1000),
        label: `Treino ${formatClock(time)}`,
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
        name: notes.trim() ? notes.trim().slice(0, 80) : `Trecho ${loopA.toFixed(1)}–${loopB.toFixed(1)}`,
        start_ms: Math.round(loopA * 1000),
        end_ms: Math.round(loopB * 1000),
      }),
    onSuccess: () => {
      setMsg("Trecho salvo");
      void qc.invalidateQueries({ queryKey: ["loops", projectId] });
    },
  });

  async function togglePlay() {
    const eng = engRef.current;
    if (!eng || !ready) return;
    try {
      if (eng.isPlaying()) {
        eng.pause();
        return;
      }
      if (sessionStarted.current == null) sessionStarted.current = Date.now();
      if (countIn) {
        setMsg("Contagem…");
        await eng.countdown(4);
        setMsg(null);
      }
      await eng.play();
    } catch (e) {
      setError(friendlyError(e, "Autoplay bloqueado"));
    }
  }

  function stop() {
    engRef.current?.pause();
    engRef.current?.seek(loopOn ? loopA : 0);
    setTime(loopOn ? loopA : 0);
  }

  function seekTo(sec: number) {
    engRef.current?.seek(sec);
    setTime(sec);
  }

  useTransportShortcuts({
    enabled: ready,
    onTogglePlay: () => void togglePlay(),
    onStop: stop,
    onToggleLoop: () => setLoopOn((v) => !v),
    onSeekBy: (d) => seekTo(Math.min(Math.max(0, time + d), duration || time + d)),
  });

  async function persistMeta() {
    await projectsApi.update(projectId, {
      bpm,
      musical_key: key || null,
      chords_hint: chords.trim() || null,
    });
    void qc.invalidateQueries({ queryKey: ["project", projectId] });
    setMsg("BPM/tom salvos");
  }

  async function detectMeta() {
    const eng = engRef.current;
    if (!eng || !ready) return;
    setAnalyzing(true);
    setError(null);
    try {
      await yieldToMain();
      const estimate = analyzeAudioBuffers(eng.getRawBuffers());
      if (!estimate) {
        setError("Áudio insuficiente para análise");
        return;
      }
      setBpm(estimate.bpm);
      setKey(estimate.musical_key);
      if (estimate.chords) setChords(estimate.chords);
      eng.setMetronome(metroOn, estimate.bpm);
      await projectsApi.update(projectId, {
        bpm: estimate.bpm,
        musical_key: estimate.musical_key,
        chords_hint: estimate.chords || null,
      });
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      setMsg(`Estimativa: ${estimate.bpm} BPM · ${estimate.musical_key}`);
    } catch (e) {
      setError(friendlyError(e, "Falha na análise"));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSavePreset() {
    const name = presetName.trim() || `Preset ${profileMeta.label}`;
    await savePracticePreset({
      name,
      projectId,
      profile,
      speedPct,
      metronomeOn: metroOn,
      metronomeBpm: bpm,
      countIn,
      loopOn,
      loopA,
      loopB,
      notes,
    });
    setPresets(await listPracticePresets(projectId));
    setPresetName("");
    setMsg(`Preset “${name}” salvo`);
  }

  function applyPreset(p: PracticePreset) {
    setProfile(p.profile as PracticeProfileId);
    setDraftSpeed(p.speedPct);
    setDraftPitch(0);
    setSpeedPct(p.speedPct);
    setPitchSemitones(0);
    setMetroOn(p.metronomeOn);
    setBpm(p.metronomeBpm);
    setCountIn(p.countIn);
    setLoopOn(p.loopOn);
    setLoopA(p.loopA);
    setLoopB(p.loopB);
    setNotes(p.notes);
    setMsg(`Preset “${p.name}” aplicado`);
  }

  if (stemsQuery.isLoading) {
    return <PageSkeleton label="Carregando treino…" />;
  }

  if (!latestStems.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-faint">
        Sem stems — complete uma separação antes de treinar.
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "treino", label: "Treino" },
    { id: "afinacao", label: "Afinação" },
    { id: "letras", label: "Letras" },
    { id: "secoes", label: "Seções" },
    { id: "mais", label: "Mais" },
  ];

  return (
    <div className="space-y-4">
      <PracticeRoomHeader
        projectId={projectId}
        projectName={project.data?.name ?? ""}
        profileLabel={profileMeta.label}
        keyLabel={key}
        bpm={bpm}
        durationSec={duration}
        ready={ready}
      />

      <div className="space-y-2">
        <InstrumentPicker value={profile} onChange={setProfile} />
        <p className="text-sm text-ink-muted">{profileMeta.instruction}</p>
      </div>

      {!profileMeta.isolated || !stemForMuteExists ? (
        <p
          role="status"
          className="rounded-2xl border border-signal-warn/40 bg-signal-warn/10 px-4 py-3 text-sm text-signal-warn"
        >
          {profileMeta.limitation ||
            (!stemForMuteExists
              ? `Esta música não tem a faixa “${muteTarget}” separada, então não dá para silenciar esse instrumento. Separe em 4 faixas para usar este modo.`
              : "Limitação do modelo de separação.")}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)]">
        <div className="min-w-0 space-y-4">
      {/* Deck principal — sempre visível */}
      <section className="panel-glass space-y-4 rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Player de treino</h2>
          <span className="font-mono text-xs text-accent">
            {ready ? `${formatClock(time)} / ${formatClock(duration)}` : `Carregando ${loadPct}%`}
          </span>
        </div>

        {!ready ? (
          <div className="space-y-2" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-canvas-overlay">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${loadPct}%` }}
              />
            </div>
            <p className="text-xs text-ink-faint">Preparando as faixas…</p>
          </div>
        ) : null}

        <div className="space-y-1">
          <p className="text-xs font-medium text-ink-muted">Referência</p>
          <PracticeScrubber
            duration={duration}
            time={time}
            peaks={peaks}
            disabled={!ready}
            onSeek={seekTo}
          />
        </div>

        <div className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-muted">Sua voz</p>
            {voiceOverlayLabel ? (
              <p className="truncate font-mono text-xs text-ink-faint">{voiceOverlayLabel}</p>
            ) : null}
          </div>
          {voicePeaks ? (
            <PracticeScrubber
              duration={duration}
              time={time}
              peaks={voicePeaks}
              disabled={!ready}
              onSeek={seekTo}
              hideClock
              waveColor={corTema("brand-blue", 0.45)}
              playheadColor="rgba(38, 139, 255, 0.95)"
              ariaLabel="Posição na faixa da voz"
            />
          ) : (
            <div
              className="flex h-[4.5rem] items-center justify-center rounded-xl border border-dashed border-line/80 bg-canvas/40 px-3 text-center text-xs text-ink-faint"
              role="status"
            >
              Grave na aba Treino — a waveform fica alinhada ao instante da música em que você
              começou.
            </div>
          )}
        </div>

        {(markers.data?.length ?? 0) > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Marcadores">
            {markers.data!.map((m) => (
              <li key={m.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-lg border border-line px-2 py-1 font-mono text-xs text-ink hover:border-accent"
                  onClick={() => seekTo(m.position_ms / 1000)}
                >
                  {m.label}
                </button>
                <button
                  type="button"
                  className="rounded px-1 text-xs text-ink-faint hover:text-signal-err"
                  aria-label={`Remover ${m.label}`}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Remover o marcador “${m.label}”?`,
                      description: "O marcador sai da linha do tempo desta música.",
                      confirmLabel: "Remover",
                      danger: true,
                    });
                    if (ok) deleteMarker.mutate(m.id);
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="hidden text-xs text-ink-faint lg:block">{TRANSPORT_SHORTCUTS_HINT}</p>

        <div
          className="flex flex-wrap items-center justify-between gap-3"
          role="toolbar"
          aria-label="Controles de treino"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="lg" onClick={() => void togglePlay()} disabled={!ready}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? "Pausar" : "Treinar"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-10 px-0"
              onClick={stop}
              disabled={!ready}
              aria-label="Parar e voltar ao início"
              title="Parar e voltar ao início (Home)"
            >
              <Square className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={loopOn ? "default" : "secondary"}
              aria-pressed={loopOn}
              onClick={() => setLoopOn((v) => !v)}
              title="Repetir um trecho (L)"
            >
              <Repeat className="h-4 w-4" />
              Loop
            </Button>
            <Button
              type="button"
              variant={instrumentMuted ? "violet" : "secondary"}
              disabled={!muteTarget || !stemForMuteExists}
              aria-pressed={instrumentMuted}
              onClick={() => setInstrumentMuted((v) => !v)}
            >
              <VolumeX className="h-4 w-4" />
              Silenciar instrumento
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => addMarker.mutate()} disabled={!ready}>
              <BookmarkPlus className="h-4 w-4" />
              Marcar ponto
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saveSession.isPending}
              onClick={() => saveSession.mutate()}
            >
              <Save className="h-4 w-4" />
              Salvar sessão
            </Button>
          </div>
        </div>

        {loopOn ? (
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line/70 bg-canvas/40 p-2 text-sm text-ink-muted">
            <div>
              <Label className="text-xs">A</Label>
              <Input
                type="number"
                step={0.01}
                value={loopA}
                className="h-8 w-20"
                onChange={(e) => setLoopA(Number(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">B</Label>
              <Input
                type="number"
                step={0.01}
                value={loopB}
                className="h-8 w-20"
                onChange={(e) => setLoopB(Number(e.target.value))}
              />
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => setLoopA(Number(time.toFixed(2)))}>
              A=agora
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setLoopB(Number(Math.max(time, loopA + 0.1).toFixed(2)))}
            >
              B=agora
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={loopB <= loopA || saveLoop.isPending}
              onClick={() => saveLoop.mutate()}
            >
              Salvar trecho
            </Button>
          </div>
        ) : null}

        <div className="grid gap-4 border-t border-line/60 pt-4 sm:grid-cols-2 xl:grid-cols-3" role="group" aria-label="Ajustes de treino">
          <div className="space-y-2">
            <Label htmlFor="prac-speed">
              Velocidade {draftSpeed}%
              {processingTx ? " · aplicando…" : ""}
            </Label>
            <input
              id="prac-speed"
              type="range"
              min={50}
              max={150}
              step={5}
              value={draftSpeed}
              disabled={!ready}
              onChange={(e) => setDraftSpeed(Number(e.target.value))}
              onPointerUp={commitSpeed}
              onKeyUp={commitSpeed}
              className="h-3 w-full accent-[var(--accent)]"
            />
            <p className="text-xs text-ink-faint">
              Solte para aplicar{processingTx ? " — aguarde o processamento atual" : ""}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prac-pitch">
              Tom {draftPitch > 0 ? `+${draftPitch}` : draftPitch}
              {processingTx ? " · aplicando…" : ""}
            </Label>
            <input
              id="prac-pitch"
              type="range"
              min={-12}
              max={12}
              step={1}
              value={draftPitch}
              disabled={!ready}
              onChange={(e) => setDraftPitch(Number(e.target.value))}
              onPointerUp={commitPitch}
              onKeyUp={commitPitch}
              className="h-3 w-full accent-[var(--violet)]"
            />
            <p className="text-xs text-ink-faint">Solte para aplicar</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prac-bpm">Metrônomo</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={metroOn ? "default" : "secondary"}
                aria-pressed={metroOn}
                onClick={() => setMetroOn((v) => !v)}
              >
                {metroOn ? "Ligado" : "Desligado"}
              </Button>
              <Input
                id="prac-bpm"
                type="number"
                min={30}
                max={300}
                value={bpm}
                className="w-20"
                onChange={(e) => setBpm(Number(e.target.value) || 120)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                checked={countIn}
                onChange={(e) => setCountIn(e.target.checked)}
              />
              Contagem de 4 tempos antes de começar
            </label>
          </div>
        </div>

      </section>

      {/* Abas — evita renderizar tudo ao mesmo tempo */}
      <div
        className="flex flex-wrap gap-1 rounded-xl border border-line/70 bg-canvas-raised p-1"
        role="tablist"
        aria-label="Painéis do treino"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-ui",
              tab === t.id
                ? "bg-canvas-card text-ink shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_4px_12px_-6px_rgb(var(--c-sombra)/calc(0.6*var(--k-sombra)))]"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "treino" ? (
        <div className="space-y-4">
          <PracticeRecorder
            projectId={projectId}
            backingReady={ready}
            overlayTakeId={overlayTakeId}
            onSelectOverlayTake={(id) => {
              setOverlayTakeId(id);
              void loadVoiceOverlay(id);
            }}
            onTakesChange={() => {
              void (async () => {
                const takes = await listPracticeTakes(projectId);
                const still =
                  overlayTakeId && takes.some((t) => t.id === overlayTakeId)
                    ? overlayTakeId
                    : (takes[0]?.id ?? null);
                if (!still) {
                  setVoicePeaks(null);
                  setOverlayTakeId(null);
                  setVoiceOverlayLabel(null);
                  return;
                }
                await loadVoiceOverlay(still);
              })();
            }}
            onGetBackingTime={() => engRef.current?.getCurrentTime() ?? 0}
            onEnsureAudioContext={async () => {
              const eng = engRef.current;
              if (!eng) return null;
              await eng.unlockOutput();
              return eng.getAudioContext();
            }}
            onPlayBacking={async (fromSec) => {
              const eng = engRef.current;
              if (!eng) throw new Error("Player de treino indisponível");
              const alive = await eng.unlockOutput();
              if (!alive) throw new Error("Áudio suspenso — clique em Play no player acima");
              const t = typeof fromSec === "number" ? fromSec : eng.getCurrentTime();
              await eng.play(t);
              await new Promise((r) => setTimeout(r, 50));
              await eng.unlockOutput();
              if (!eng.isPlaying()) {
                await eng.play(t);
              }
            }}
            onPauseBacking={() => {
              engRef.current?.pause();
            }}
            onIsBackingPlaying={() => engRef.current?.isPlaying() ?? false}
          />
          {(loops.data?.length ?? 0) > 0 ? (
            <section className="space-y-2 rounded-2xl border border-line/70 bg-glass p-4">
              <h3 className="font-display text-sm font-semibold text-ink">Trechos salvos</h3>
              <ul className="space-y-2">
                {loops.data!.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-line/70 px-3 py-2 text-left text-sm hover:border-accent/40"
                      onClick={() => {
                        setLoopA(l.start_ms / 1000);
                        setLoopB(l.end_ms / 1000);
                        setLoopOn(true);
                        seekTo(l.start_ms / 1000);
                      }}
                    >
                      <span className="truncate text-ink">{l.name}</span>
                      <span className="font-mono text-xs text-ink-faint">
                        {(l.start_ms / 1000).toFixed(1)}–{(l.end_ms / 1000).toFixed(1)}s
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "afinacao" ? (
        <PracticePitchPanel
          analysis={pitchAnalysis}
          analyzing={pitchAnalyzing}
          error={pitchError}
          toleranceCents={toleranceCents}
          onToleranceChange={setToleranceCents}
          onAnalyze={() => void runPitchAnalysis()}
          onSeek={seekTo}
          canAnalyze={ready && !pitchAnalyzing}
          takeLabel={voiceOverlayLabel}
        />
      ) : null}

      {tab === "letras" ? (
        <div id="letras">
          <LyricsPanel projectId={projectId} currentTimeSec={time} onSeek={seekTo} />
        </div>
      ) : null}

      {tab === "secoes" ? (
        <SongSectionsPanel
          projectId={projectId}
          currentTimeSec={time}
          onSeek={seekTo}
          onSetLoop={(a, b) => {
            setLoopA(a);
            setLoopB(b);
            setLoopOn(true);
          }}
        />
      ) : null}

      {tab === "mais" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3 rounded-2xl border border-line/70 bg-glass p-4">
            <h3 className="font-display text-sm font-semibold text-ink">Anotações & presets</h3>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações da sessão…"
            />
            <div className="flex flex-wrap gap-2">
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Nome do preset"
                className="min-w-[10rem] flex-1"
              />
              <Button type="button" size="sm" onClick={() => void handleSavePreset()}>
                <Save className="h-4 w-4" />
                Salvar
              </Button>
            </div>
            {presets.length === 0 ? (
              <p className="text-sm text-ink-faint">Nenhum preset ainda</p>
            ) : (
              <ul className="space-y-2">
                {presets.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line/70 px-3 py-2"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm hover:text-accent"
                      onClick={() => applyPreset(p)}
                    >
                      {p.name}
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Excluir ${p.name}`}
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Excluir o ajuste “${p.name}”?`,
                          description: "As configurações salvas neste ajuste serão apagadas.",
                          confirmLabel: "Excluir ajuste",
                          danger: true,
                        });
                        if (!ok) return;
                        void deletePracticePreset(p.id).then(async () =>
                          setPresets(await listPracticePresets(projectId)),
                        );
                      }}
                    >
                      ×
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-line/70 bg-glass p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-ink">Sessões</h3>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={saveSession.isPending}
                onClick={() => saveSession.mutate()}
              >
                Registrar
              </Button>
            </div>
            {(history.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-ink-faint">Nenhuma sessão ainda</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line/70 text-sm">
                {history.data!.items.slice(0, 8).map((s) => (
                  <li key={s.id} className="flex justify-between gap-2 px-3 py-2">
                    <span className="capitalize text-ink">{s.profile}</span>
                    <span className="font-mono text-xs text-ink-faint">{s.duration_sec}s</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 border-t border-line/50 pt-3">
              <h4 className="text-xs font-medium text-ink-faint">
                BPM / tom
              </h4>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Tom"
                  className="w-24"
                />
                <Input
                  value={chords}
                  onChange={(e) => setChords(e.target.value)}
                  placeholder="Acordes"
                  className="min-w-[8rem] flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!ready || analyzing}
                  onClick={() => void detectMeta()}
                >
                  {analyzing ? "…" : "Detectar"}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => void persistMeta()}>
                  Salvar
                </Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-signal-err">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p role="status" className={cn("text-sm", processingTx ? "text-ink-faint" : "text-accent")}>
          {msg}
        </p>
      ) : null}
      {processingTx ? <p className="text-xs text-ink-faint">Ajustando velocidade/tom…</p> : null}
        </div>

        <PracticeCoachPanel
          projectId={projectId}
          tab={coachTab}
          onTabChange={setCoachTab}
          sessions={history.data?.items ?? []}
          analysis={pitchAnalysis}
          onSeek={seekTo}
          className="xl:sticky xl:top-4 xl:self-start"
        />
      </div>
      {confirmDialog}
    </div>
  );
}

function applyMix(eng: AudioEngine, profile: PracticeProfileId, instrumentMuted: boolean) {
  const mix = mixForProfile(profile);
  const target = mutedStemForProfile(profile);
  for (const [id, cfg] of Object.entries(mix)) {
    const next =
      target && id === target ? { ...cfg, mute: instrumentMuted } : { ...cfg, mute: false };
    eng.setChannel(id, next);
  }
  eng.applyAllChannels();
}
