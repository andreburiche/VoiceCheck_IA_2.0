"use client";

import { Mic2, Drum, Guitar, Music2 } from "lucide-react";

import type { StemMixState } from "@/lib/api";
import { STEM_COLORS, STEM_LABELS } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof Mic2> = {
  vocals: Mic2,
  drums: Drum,
  bass: Guitar,
  other: Music2,
};

type TrackLaneProps = {
  stemType: string;
  cfg: StemMixState;
  waveWidthPx: number;
  playheadRatio: number;
  loopOn?: boolean;
  loopStartRatio?: number;
  loopEndRatio?: number;
  onChange: (patch: Partial<StemMixState>) => void;
  waveRef: (el: HTMLDivElement | null) => void;
};

export function TrackLane({
  stemType,
  cfg,
  waveWidthPx,
  playheadRatio,
  loopOn,
  loopStartRatio = 0,
  loopEndRatio = 0,
  onChange,
  waveRef,
}: TrackLaneProps) {
  const color = STEM_COLORS[stemType] ?? "#20D9D2";
  const Icon = ICONS[stemType] ?? Music2;
  const label = STEM_LABELS[stemType] ?? stemType;

  return (
    <div className="flex min-h-[72px] border-b border-line">
      <div className="flex w-44 shrink-0 flex-col justify-center gap-1.5 border-r border-line bg-canvas-raised/90 px-2 py-2 md:w-52">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-7 w-7 toque:h-11 toque:w-11 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}22`, color }}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="truncate text-sm font-medium text-ink">{label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            className={cn(
              "h-7 w-7 toque:h-11 toque:w-11 rounded-md border text-xs font-semibold",
              cfg.mute
                ? "border-signal-err/50 bg-signal-err/20 text-signal-err"
                : "border-line text-ink-muted hover:border-ink-faint",
            )}
            aria-pressed={cfg.mute}
            aria-label={`Silenciar ${label}`}
            onClick={() => onChange({ mute: !cfg.mute })}
          >
            M
          </button>
          <button
            type="button"
            className={cn(
              "h-7 w-7 toque:h-11 toque:w-11 rounded-md border text-xs font-semibold",
              cfg.solo
                ? "border-accent/50 bg-accent/20 text-accent"
                : "border-line text-ink-muted hover:border-ink-faint",
            )}
            aria-pressed={cfg.solo}
            aria-label={`Ouvir só ${label}`}
            onClick={() => onChange({ solo: !cfg.solo })}
          >
            S
          </button>
          <label className="flex flex-1 items-center gap-1 text-xs text-ink-faint">
            <span className="sr-only">Volume {label}</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={cfg.volume}
              className="h-1 w-full accent-[var(--accent)]"
              onChange={(e) => onChange({ volume: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="flex items-center gap-1 text-xs text-ink-faint">
          Pan
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={cfg.pan}
            className="h-1 flex-1 accent-[var(--violet)]"
            onChange={(e) => onChange({ pan: Number(e.target.value) })}
            aria-label={`Pan ${label}`}
          />
        </label>
      </div>

      <div className="relative min-w-0 flex-1 overflow-hidden bg-canvas/40">
        <div className="relative h-[72px]" style={{ width: Math.max(waveWidthPx, 320) }}>
          {loopOn && loopEndRatio > loopStartRatio ? (
            <div
              className="pointer-events-none absolute inset-y-0 z-[1] bg-accent/10"
              style={{
                left: `${loopStartRatio * 100}%`,
                width: `${(loopEndRatio - loopStartRatio) * 100}%`,
              }}
              aria-hidden
            />
          ) : null}
          <div ref={waveRef} className="h-full w-full" data-stem={stemType} />
          <div
            className="pointer-events-none absolute top-0 z-[2] h-full w-0.5 bg-ink"
            style={{ left: `${Math.min(1, Math.max(0, playheadRatio)) * 100}%` }}
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
