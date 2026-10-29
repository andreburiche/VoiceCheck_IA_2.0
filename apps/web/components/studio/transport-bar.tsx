"use client";

import { Pause, Play, SkipBack, Square } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

type TransportBarProps = {
  ready: boolean;
  playing: boolean;
  time: number;
  duration: number;
  speedPct: number;
  pitchSemitones: number;
  metronomeOn: boolean;
  metronomeBpm: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSeekStart: () => void;
  onSeek: (seconds: number) => void;
  onSpeed: (pct: number) => void;
  onPitch: (semitones: number) => void;
  onToggleMetronome: () => void;
  onBpm: (bpm: number) => void;
};

export function TransportBar({
  ready,
  playing,
  time,
  duration,
  speedPct,
  pitchSemitones,
  metronomeOn,
  metronomeBpm,
  onPlayPause,
  onStop,
  onSeekStart,
  onSeek,
  onSpeed,
  onPitch,
  onToggleMetronome,
  onBpm,
}: TransportBarProps) {
  const [draftSpeed, setDraftSpeed] = useState(speedPct);
  const [draftPitch, setDraftPitch] = useState(pitchSemitones);

  useEffect(() => setDraftSpeed(speedPct), [speedPct]);
  useEffect(() => setDraftPitch(pitchSemitones), [pitchSemitones]);

  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-canvas/95 px-4 py-2.5 backdrop-blur md:px-5"
      role="toolbar"
      aria-label="Transporte"
    >
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!ready}
          aria-label="Ir ao início"
          onClick={onSeekStart}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!ready}
          aria-label={playing ? "Pausar" : "Reproduzir"}
          onClick={onPlayPause}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={!ready} aria-label="Parar" onClick={onStop}>
          <Square className="h-4 w-4" />
        </Button>
      </div>

      <span className="font-mono text-xs tabular-nums text-ink" aria-live="off">
        {formatClock(time)}
        <span className="text-ink-faint"> / {formatClock(duration)}</span>
      </span>

      <label className="flex min-w-[10rem] flex-1 items-center gap-2 text-xs text-ink-muted">
        <span className="sr-only">Posição</span>
        <input
          type="range"
          className="w-full accent-[var(--accent)]"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(time, duration || 0)}
          disabled={!ready || duration <= 0}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-valuetext={formatClock(time)}
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-muted" title="Solte para aplicar">
        Vel.
        <input
          type="range"
          min={50}
          max={150}
          step={5}
          value={draftSpeed}
          disabled={!ready}
          className="w-24 accent-[var(--accent)]"
          onChange={(e) => setDraftSpeed(Number(e.target.value))}
          onPointerUp={(e) => onSpeed(Number(e.currentTarget.value))}
          onKeyUp={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
              onSpeed(Number(e.currentTarget.value));
            }
          }}
          aria-label="Velocidade de reprodução"
        />
        <span className="w-10 font-mono text-ink">{draftSpeed}%</span>
      </label>

      <label
        className="flex items-center gap-2 text-xs text-ink-muted"
        title="Solte para aplicar · tom em semitons"
      >
        Tom
        <input
          type="range"
          min={-12}
          max={12}
          step={1}
          value={draftPitch}
          disabled={!ready}
          className="w-24 accent-[var(--violet)]"
          onChange={(e) => setDraftPitch(Number(e.target.value))}
          onPointerUp={(e) => onPitch(Number(e.currentTarget.value))}
          onKeyUp={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
              onPitch(Number(e.currentTarget.value));
            }
          }}
          aria-label="Alteração de tom em semitons"
        />
        <span className="w-8 font-mono text-ink">
          {draftPitch > 0 ? `+${draftPitch}` : draftPitch}
        </span>
      </label>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={metronomeOn ? "default" : "secondary"}
          disabled={!ready}
          aria-pressed={metronomeOn}
          onClick={onToggleMetronome}
        >
          Metrônomo
        </Button>
        <label className={cn("flex items-center gap-1 text-xs text-ink-muted", !metronomeOn && "opacity-50")}>
          <span className="sr-only">BPM do metrônomo</span>
          <input
            type="number"
            min={30}
            max={300}
            value={metronomeBpm}
            disabled={!ready}
            className="h-8 w-16 rounded-lg border border-line bg-canvas-raised px-2 font-mono text-ink"
            onChange={(e) => onBpm(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
