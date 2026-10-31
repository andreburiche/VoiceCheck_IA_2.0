"use client";

import { corTema } from "@/lib/tema";
import { useEffect, useRef } from "react";

import { extractPeaks } from "@/lib/audio-peaks";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

export { extractPeaks };

type PracticeScrubberProps = {
  duration: number;
  time: number;
  /** Picos normalizados 0..1 (opcional, desenhados uma vez). */
  peaks?: Float32Array | null;
  disabled?: boolean;
  onSeek: (sec: number) => void;
  className?: string;
  /** Cor da waveform (CSS color). Default: accent cyan. */
  waveColor?: string;
  /** Cor do playhead. */
  playheadColor?: string;
  /** Esconde relógio sob a barra. */
  hideClock?: boolean;
  /** aria-label do range. */
  ariaLabel?: string;
};

/** Scrubber leve — evita WaveSurfer (que travava a UI no seek por RAF). */
export function PracticeScrubber({
  duration,
  time,
  peaks,
  disabled,
  onSeek,
  className,
  waveColor,
  playheadColor = "rgba(46, 230, 214, 0.95)",
  hideClock = false,
  ariaLabel = "Posição na faixa",
}: PracticeScrubberProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ratio = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 320;
    const h = 56;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!peaks?.length) return;
    ctx.fillStyle = waveColor ?? corTema("accent", 0.35);
    const mid = h / 2;
    const step = Math.max(1, Math.floor(peaks.length / w));
    for (let x = 0; x < w; x++) {
      const i = Math.min(peaks.length - 1, x * step);
      const amp = peaks[i] ?? 0;
      const bar = Math.max(1, amp * (h * 0.42));
      ctx.fillRect(x, mid - bar, 1, bar * 2);
    }
  }, [peaks, waveColor]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative overflow-hidden rounded-xl border border-line/70 bg-canvas/70">
        <canvas ref={canvasRef} className="block h-14 w-full" aria-hidden />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-accent/10"
          style={{ width: `${ratio * 100}%` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-1 w-0.5 rounded-full shadow-glow"
          style={{ left: `calc(${ratio * 100}% - 1px)`, backgroundColor: playheadColor }}
          aria-hidden
        />
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.01)}
          step={0.01}
          value={Math.min(time, duration || 0)}
          disabled={disabled || duration <= 0}
          aria-label={ariaLabel}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onChange={(e) => onSeek(Number(e.target.value))}
        />
      </div>
      {!hideClock ? (
        <div className="flex justify-between font-mono text-xs text-ink-faint">
          <span>{formatClock(time)}</span>
          <span>{formatClock(duration)}</span>
        </div>
      ) : null}
    </div>
  );
}
