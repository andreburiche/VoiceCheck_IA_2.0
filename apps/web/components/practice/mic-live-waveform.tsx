"use client";

import { corTema } from "@/lib/tema";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type Props = {
  /** Preferir Analyser do LiveVoiceFx (mesmo AudioContext do player). */
  analyser?: AnalyserNode | null;
  /** Fallback legado — evita criar 2º context se analyser existir. */
  stream?: MediaStream | null;
  active: boolean;
  className?: string;
};

/**
 * Forma de onda ao vivo da voz (estilo do player de treino).
 */
export function MicLiveWaveform({ analyser, stream, active, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef<number[]>(Array.from({ length: 240 }, () => 0.02));

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let raf = 0;
    let ownedCtx: AudioContext | null = null;
    let ownedSource: MediaStreamAudioSourceNode | null = null;
    let node: AnalyserNode | null = analyser ?? null;

    const run = async () => {
      if (!node && stream) {
        ownedCtx = new AudioContext();
        if (ownedCtx.state === "suspended") await ownedCtx.resume();
        ownedSource = ownedCtx.createMediaStreamSource(stream);
        node = ownedCtx.createAnalyser();
        node.fftSize = 1024;
        node.smoothingTimeConstant = 0.65;
        ownedSource.connect(node);
      }
      if (!node) return;

      const data = new Uint8Array(node.fftSize);
      const draw = () => {
        if (cancelled || !node) return;
        node.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = ((data[i] ?? 128) - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const peaks = peaksRef.current;
        peaks.push(Math.min(1, rms * 3.2));
        if (peaks.length > 240) peaks.shift();

        const canvas = canvasRef.current;
        if (canvas) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const w = canvas.clientWidth || 320;
          const h = 56;
          if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
          }
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = corTema("canvas", 0.55);
            ctx.fillRect(0, 0, w, h);
            const mid = h / 2;
            const n = peaks.length;
            for (let x = 0; x < w; x++) {
              const i = Math.floor((x / w) * n);
              const amp = peaks[i] ?? 0;
              const bar = Math.max(1, amp * (h * 0.45));
              ctx.fillStyle =
                amp > 0.35 ? corTema("brand-blue", 0.75) : corTema("accent", 0.55);
              ctx.fillRect(x, mid - bar, 1, bar * 2);
            }
            ctx.fillStyle = corTema("accent", 0.95);
            ctx.fillRect(w - 2, 4, 2, h - 8);
          }
        }
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    };

    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try {
        ownedSource?.disconnect();
      } catch {
        /* ignore */
      }
      void ownedCtx?.close().catch(() => undefined);
    };
  }, [analyser, stream, active]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-accent/35 bg-canvas/70",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-line/40 px-3 py-1.5">
        <span className="text-xs font-medium text-accent">
          Trilha da voz (ao vivo)
        </span>
        <span className="font-mono text-xs text-ink-faint">mic</span>
      </div>
      <canvas
        ref={canvasRef}
        className="block h-14 w-full"
        aria-label="Forma de onda do microfone"
      />
    </div>
  );
}
