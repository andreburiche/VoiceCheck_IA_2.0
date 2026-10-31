"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Fragmento do estúdio multitrack (exemplo) com mute/solo funcionando.
 * As formas de onda são geradas de forma determinística (sem Math.random)
 * para não divergir entre servidor e cliente.
 */

type StemId = "vocals" | "drums" | "bass" | "other";

const STEMS: { id: StemId; label: string; color: string; seed: number; shape: "voice" | "hits" | "low" | "pad" }[] = [
  { id: "vocals", label: "Voz", color: "#20D9D2", seed: 3, shape: "voice" },
  { id: "drums", label: "Bateria", color: "#268BFF", seed: 7, shape: "hits" },
  { id: "bass", label: "Baixo", color: "#3DDB8A", seed: 11, shape: "low" },
  { id: "other", label: "Outros", color: "#94A3B8", seed: 17, shape: "pad" },
];

const BARS = 72;
const PLAYHEAD = 0.38;

function wave(seed: number, shape: (typeof STEMS)[number]["shape"]): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < BARS; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    let v: number;
    if (shape === "hits") v = i % 4 === 0 ? 0.85 + r * 0.15 : i % 2 === 0 ? 0.45 + r * 0.2 : 0.15 + r * 0.15;
    else if (shape === "voice") v = (i > 6 && i < 30) || (i > 38 && i < 66) ? 0.35 + r * 0.6 : 0.04 + r * 0.05;
    else if (shape === "low") v = 0.4 + 0.25 * Math.sin(i / 3) + r * 0.15;
    else v = 0.3 + 0.15 * Math.sin(i / 9) + r * 0.2;
    // inteiro em %: evita diferença de casas decimais entre servidor e navegador
    out.push(Math.round(Math.max(0.04, Math.min(1, v)) * 100));
  }
  return out;
}

const WAVES = Object.fromEntries(STEMS.map((s) => [s.id, wave(s.seed, s.shape)])) as Record<StemId, number[]>;

/** Nível no ponto do playhead (0–100), usado pelo medidor de cada faixa. */
const LEVELS = Object.fromEntries(
  STEMS.map((s) => [s.id, WAVES[s.id][Math.floor(PLAYHEAD * BARS)]]),
) as Record<StemId, number>;

const SEGMENTS = 8;

/** Medidor de nível em segmentos; os dois últimos acendem em laranja (pico). */
function LevelMeter({ level }: { level: number }) {
  const lit = Math.round((level / 100) * SEGMENTS);
  return (
    <span className="hidden h-8 shrink-0 flex-col-reverse gap-0.5 sm:flex" aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-[3px] w-2.5 rounded-[1px]",
            i < lit ? (i >= SEGMENTS - 2 ? "bg-flare" : "bg-accent") : "bg-ink/10",
          )}
        />
      ))}
    </span>
  );
}

export function StudioPreview({ className }: { className?: string }) {
  const [muted, setMuted] = useState<Record<StemId, boolean>>({
    vocals: false,
    drums: false,
    bass: false,
    other: false,
  });
  const [solo, setSolo] = useState<StemId | null>(null);

  const audible = (id: StemId) => (solo ? solo === id : !muted[id]);
  const audibleCount = STEMS.filter((s) => audible(s.id)).length;

  return (
    <div data-ui className={cn("panel-glass overflow-hidden rounded-2xl text-ink", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-ink/5 px-5 py-3.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">ensaio-coral.wav</p>
          <p className="hud-label mt-0.5 normal-case tracking-normal">4 faixas · Demucs htdemucs · exemplo</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-data text-xs text-ink-muted" aria-live="polite">
            {audibleCount === 4 ? "Mix completo" : `${audibleCount}/4 faixas`}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-ink/5">
        {STEMS.map((stem) => {
          const on = audible(stem.id);
          return (
            <li key={stem.id} className="flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-5">
              <span className="w-16 shrink-0 text-sm font-medium sm:w-20">{stem.label}</span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-pressed={muted[stem.id]}
                  aria-label={`${muted[stem.id] ? "Reativar" : "Silenciar"} ${stem.label}`}
                  onClick={() => setMuted((m) => ({ ...m, [stem.id]: !m[stem.id] }))}
                  className={cn(
                    "h-8 w-8 rounded-md text-xs font-semibold transition-colors duration-ui",
                    muted[stem.id]
                      ? "bg-ink text-canvas"
                      : "bg-canvas-overlay text-ink-muted hover:bg-line hover:text-ink",
                  )}
                >
                  M
                </button>
                <button
                  type="button"
                  aria-pressed={solo === stem.id}
                  aria-label={`${solo === stem.id ? "Tirar solo de" : "Solo em"} ${stem.label}`}
                  onClick={() => setSolo((s) => (s === stem.id ? null : stem.id))}
                  className={cn(
                    "h-8 w-8 rounded-md text-xs font-semibold transition-colors duration-ui",
                    solo === stem.id
                      ? "bg-accent text-canvas"
                      : "bg-canvas-overlay text-ink-muted hover:bg-line hover:text-ink",
                  )}
                >
                  S
                </button>
              </div>
              <div
                className="relative flex h-10 min-w-0 flex-1 items-center gap-px transition-opacity duration-ui"
                style={{ opacity: on ? 1 : 0.18 }}
                aria-hidden
              >
                {WAVES[stem.id].map((v, i) => (
                  <span
                    key={i}
                    className="flex-1 rounded-[1px]"
                    style={{
                      height: `${v}%`,
                      backgroundColor: stem.color,
                      opacity: i / BARS < PLAYHEAD ? 1 : 0.55,
                    }}
                  />
                ))}
                <span
                  className="pointer-events-none absolute -inset-y-1.5 w-0.5 bg-ink"
                  style={{ left: `${PLAYHEAD * 100}%` }}
                />
              </div>
              <LevelMeter level={on ? LEVELS[stem.id] : 0} />
            </li>
          );
        })}
      </ul>

      <div className="text-data flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ink/5 px-5 py-3 text-xs text-ink-muted">
        <span>1:23 / 3:38</span>
        <span>Loop A–B 1:12 → 1:31 · 85% da velocidade, mesmo tom</span>
      </div>
    </div>
  );
}
