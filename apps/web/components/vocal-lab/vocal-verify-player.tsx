"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ScoreSynth,
  SYNTH_INSTRUMENTS,
  type SynthInstrument,
  type SynthNote,
} from "@/lib/score-synth";

type MixMode = "both" | "recording" | "score";

type Props = {
  audioUrl: string | null;
  notes: SynthNote[];
  instrument: SynthInstrument;
  onInstrumentChange: (i: SynthInstrument) => void;
  stopEpoch?: number;
  onTimeUpdate?: (t: number) => void;
  disabled?: boolean;
};

function fmt(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Compara gravação × partitura (juntos ou separados) com timbre escolhido.
 */
export function VocalVerifyPlayer({
  audioUrl,
  notes,
  instrument,
  onInstrumentChange,
  stopEpoch = 0,
  onTimeUpdate,
  disabled,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthRef = useRef(new ScoreSynth());
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mode, setMode] = useState<MixMode>("both");
  const [recVol, setRecVol] = useState(0.85);
  const [scoreVol, setScoreVol] = useState(0.55);
  const modeRef = useRef(mode);
  const notesRef = useRef(notes);
  const instrumentRef = useRef(instrument);
  const scoreVolRef = useRef(scoreVol);
  const scoreRafRef = useRef(0);
  const playingRef = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    instrumentRef.current = instrument;
  }, [instrument]);
  useEffect(() => {
    scoreVolRef.current = scoreVol;
    synthRef.current.setGain(scoreVol);
  }, [scoreVol]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !audioUrl) return;
    a.pause();
    a.src = audioUrl;
    a.load();
    setPlaying(false);
    setCurrent(0);
    synthRef.current.stop();
  }, [audioUrl]);

  useEffect(() => {
    if (!stopEpoch) return;
    hardStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopEpoch]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => setDuration(a.duration || 0);
    const onTime = () => {
      setCurrent(a.currentTime);
      onTimeUpdate?.(a.currentTime);
    };
    const onEnd = () => {
      setPlaying(false);
      synthRef.current.stop();
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnd);
    };
  }, [onTimeUpdate]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = recVol;
  }, [recVol]);

  useEffect(() => () => synthRef.current.stop(), []);

  function hardStop() {
    playingRef.current = false;
    if (scoreRafRef.current) cancelAnimationFrame(scoreRafRef.current);
    scoreRafRef.current = 0;
    const a = audioRef.current;
    a?.pause();
    if (a) a.currentTime = 0;
    synthRef.current.stop();
    setPlaying(false);
    setCurrent(0);
    onTimeUpdate?.(0);
  }

  async function startScoreFrom(fromSec: number) {
    const m = modeRef.current;
    if (m === "recording") {
      synthRef.current.stop();
      return;
    }
    const ns = notesRef.current;
    if (!ns.length) return;
    synthRef.current.stop();
    void synthRef.current.playNotes(ns, {
      instrument: instrumentRef.current,
      absoluteTimeline: true,
      fromSec,
      gain: scoreVolRef.current,
      onNote: (_i, t) => onTimeUpdate?.(t),
    });
  }

  async function toggle() {
    const a = audioRef.current;
    const m = modeRef.current;
    if (playing) {
      playingRef.current = false;
      if (scoreRafRef.current) cancelAnimationFrame(scoreRafRef.current);
      a?.pause();
      synthRef.current.stop();
      setPlaying(false);
      return;
    }

    const from = a?.currentTime ?? 0;
    playingRef.current = true;

    if (m === "recording" || m === "both") {
      if (!audioUrl || !a) {
        playingRef.current = false;
        return;
      }
      try {
        await a.play();
      } catch {
        playingRef.current = false;
        setPlaying(false);
        return;
      }
    }

    if (m === "score" || m === "both") {
      await startScoreFrom(from);
    }

    if (m === "score") {
      setPlaying(true);
      const startWall = performance.now();
      const startAt = from;
      const endAt =
        notesRef.current.reduce((m2, n) => Math.max(m2, n.startSec + n.durationSec), 0) || from;
      const tick = () => {
        if (!playingRef.current || modeRef.current !== "score") return;
        const t = startAt + (performance.now() - startWall) / 1000;
        if (t >= endAt) {
          setCurrent(endAt);
          setPlaying(false);
          playingRef.current = false;
          onTimeUpdate?.(endAt);
          return;
        }
        setCurrent(t);
        onTimeUpdate?.(t);
        scoreRafRef.current = requestAnimationFrame(tick);
      };
      scoreRafRef.current = requestAnimationFrame(tick);
      return;
    }

    setPlaying(true);
  }

  function stop() {
    hardStop();
  }

  function seek(v: number) {
    const a = audioRef.current;
    if (a) a.currentTime = v;
    setCurrent(v);
    onTimeUpdate?.(v);
    if (playing) {
      synthRef.current.stop();
      if (modeRef.current !== "recording") void startScoreFrom(v);
    }
  }

  const canPlay =
    !disabled &&
    ((mode !== "score" && !!audioUrl) || (mode !== "recording" && notes.length > 0));

  return (
    <div className="space-y-3 rounded-2xl border border-accent/35 bg-accent/5 p-4">
      <audio ref={audioRef} preload="metadata" className="hidden" />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-sm font-semibold text-ink">Verificar gravação × partitura</p>
          <p className="text-xs text-ink-faint">
            Toque os dois juntos para conferir se as notas batem com a voz. Escolha o som da
            partitura (síntese aproximada).
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-ink-faint">
          {fmt(current)} / {fmt(duration || notes.at(-1)?.startSec || 0)}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label htmlFor="verify-mode">Ouvir</Label>
          <select
            id="verify-mode"
            className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-ink"
            value={mode}
            onChange={(e) => {
              const next = e.target.value as MixMode;
              setMode(next);
              if (playing) {
                synthRef.current.stop();
                const a = audioRef.current;
                if (next === "score") a?.pause();
                else if (a && audioUrl && a.paused && (next === "recording" || next === "both")) {
                  void a.play();
                }
                if (next !== "recording") void startScoreFrom(a?.currentTime ?? 0);
              }
            }}
          >
            <option value="both">Gravação + partitura</option>
            <option value="recording">Só gravação</option>
            <option value="score">Só partitura</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="verify-inst">Som da partitura</Label>
          <select
            id="verify-inst"
            className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-ink"
            value={instrument}
            onChange={(e) => {
              const inst = e.target.value as SynthInstrument;
              onInstrumentChange(inst);
              if (playing && modeRef.current !== "recording") {
                void startScoreFrom(audioRef.current?.currentTime ?? current);
              }
            }}
          >
            {SYNTH_INSTRUMENTS.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="vol-rec">Volume gravação {Math.round(recVol * 100)}%</Label>
          <input
            id="vol-rec"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={recVol}
            disabled={mode === "score"}
            onChange={(e) => setRecVol(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="vol-score">Volume partitura {Math.round(scoreVol * 100)}%</Label>
          <input
            id="vol-score"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={scoreVol}
            disabled={mode === "recording"}
            onChange={(e) => setScoreVol(Number(e.target.value))}
            className="w-full accent-[var(--violet)]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={playing ? "violet" : "default"}
          disabled={!canPlay}
          onClick={() => void toggle()}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pausar" : "Tocar e comparar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={stop}>
          <Square className="h-3.5 w-3.5" />
          Parar
        </Button>
        {!audioUrl && mode !== "score" ? (
          <span className="text-xs text-signal-warn">Sem áudio de gravação ainda</span>
        ) : null}
        {!notes.length && mode !== "recording" ? (
          <span className="text-xs text-signal-warn">Sem notas na partitura</span>
        ) : null}
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0.1, duration || notes.reduce((m, n) => Math.max(m, n.startSec + n.durationSec), 0) || 0.1)}
        step={0.05}
        value={current}
        disabled={!canPlay}
        onChange={(e) => seek(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
        aria-label="Posição"
      />
    </div>
  );
}
