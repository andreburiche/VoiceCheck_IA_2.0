import type { CSSProperties } from "react";

import { LiveBadge } from "@/components/hud";
import { cn } from "@/lib/utils";

/**
 * Fragmento do relatório VoiceCheck (exemplo). Os números exibidos são
 * calculados a partir da mesma curva desenhada — tudo fecha entre si.
 */

type Note = { name: string; semi: number; dur: number; offsetCents: number; vibrato?: boolean };

// Frase de exemplo em Dó maior (semitons acima de Dó4).
const PHRASE: Note[] = [
  { name: "Mi4", semi: 4, dur: 1, offsetCents: 6 },
  { name: "Sol4", semi: 7, dur: 1, offsetCents: -9 },
  { name: "Lá4", semi: 9, dur: 1.4, offsetCents: -38 },
  { name: "Sol4", semi: 7, dur: 0.8, offsetCents: 4 },
  { name: "Mi4", semi: 4, dur: 1, offsetCents: -12 },
  { name: "Ré4", semi: 2, dur: 0.9, offsetCents: 31 },
  { name: "Dó4", semi: 0, dur: 1.9, offsetCents: -3, vibrato: true },
];

const TOLERANCE = 25; // cents
const VIBRATO_HZ = 5.6;
const SECONDS_PER_BEAT = 0.5;

const W = 640;
const H = 260;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 28;
const SEMI_MIN = -1;
const SEMI_MAX = 10;

const totalBeats = PHRASE.reduce((s, n) => s + n.dur, 0);
const x = (beat: number) => PAD_L + (beat / totalBeats) * (W - PAD_L - PAD_R);
const y = (semi: number) =>
  PAD_T + ((SEMI_MAX - semi) / (SEMI_MAX - SEMI_MIN)) * (H - PAD_T - PAD_B);

type Seg = { d: string; off: boolean; drawMs: number; delayMs: number };

/** A curva é desenhada da esquerda para a direita, nota a nota, como uma leitura em tempo real. */
const DRAW_TOTAL_MS = 1800;
const DRAW_START_MS = 250;

function buildCurve() {
  const segs: Seg[] = [];
  let beat = 0;
  PHRASE.forEach((note, i) => {
    const prev = PHRASE[i - 1];
    const steps = Math.max(12, Math.round(note.dur * 24));
    const pts: string[] = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const b = beat + t * note.dur;
      // ataque: desliza da nota anterior nos primeiros 12% da nota
      let semi = note.semi + note.offsetCents / 100;
      if (prev && t < 0.12) {
        const from = prev.semi + prev.offsetCents / 100;
        const e = t / 0.12;
        semi = from + (semi - from) * (1 - (1 - e) * (1 - e));
      }
      if (note.vibrato && t > 0.25) {
        const secs = (t - 0.25) * note.dur * SECONDS_PER_BEAT;
        semi += 0.16 * Math.sin(2 * Math.PI * VIBRATO_HZ * secs) * Math.min(1, (t - 0.25) * 4);
      }
      pts.push(`${x(b).toFixed(1)},${y(semi).toFixed(1)}`);
    }
    segs.push({
      d: `M${pts.join(" L")}`,
      off: Math.abs(note.offsetCents) > TOLERANCE,
      drawMs: Math.round((note.dur / totalBeats) * DRAW_TOTAL_MS),
      delayMs: DRAW_START_MS + Math.round((beat / totalBeats) * DRAW_TOTAL_MS),
    });
    beat += note.dur;
  });
  return segs;
}

const CURVE = buildCurve();
const IN_TUNE = PHRASE.filter((n) => Math.abs(n.offsetCents) <= TOLERANCE).length;
const MEAN_ABS = Math.round(
  PHRASE.reduce((s, n) => s + Math.abs(n.offsetCents) * n.dur, 0) / totalBeats,
);
const WORST = PHRASE.reduce((a, n) => (Math.abs(n.offsetCents) > Math.abs(a.offsetCents) ? n : a));
const WORST_INDEX = PHRASE.indexOf(WORST) + 1;
const GRID_NOTES = [
  { semi: 0, label: "Dó4" },
  { semi: 2, label: "Ré4" },
  { semi: 4, label: "Mi4" },
  { semi: 7, label: "Sol4" },
  { semi: 9, label: "Lá4" },
];

export function PitchReportPreview({ className, live = false }: { className?: string; live?: boolean }) {
  let beat = 0;
  const plotLeft = `${(PAD_L / W) * 100}%`;
  const plotWidth = `${((W - PAD_L - PAD_R) / W) * 100}%`;
  return (
    <figure
      data-ui
      className={cn("panel-glass overflow-hidden rounded-2xl text-ink", className)}
      aria-label="Exemplo de relatório de afinação do VoiceCheck IA"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-white/5 px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Afinação por nota</p>
          <p className="hud-label mt-0.5 normal-case tracking-normal">Frase 3 de 8 · referência MIDI · exemplo</p>
        </div>
        {live ? <LiveBadge label="Analisando" /> : null}
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby="pitch-desc">
          <desc id="pitch-desc">
            Curva de afinação sobre {PHRASE.length} notas; {IN_TUNE} dentro da tolerância, nota {WORST_INDEX} (
            {WORST.name}) {Math.abs(WORST.offsetCents)} cents {WORST.offsetCents < 0 ? "abaixo" : "acima"}.
          </desc>
          {GRID_NOTES.map((g) => (
            <g key={g.semi}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(g.semi)}
                y2={y(g.semi)}
                stroke="rgba(148,163,184,0.14)"
                strokeDasharray="2 6"
              />
              <text x={PAD_L - 8} y={y(g.semi) + 4} textAnchor="end" fontSize={13} fill="#8392A8" fontFamily="var(--font-mono)">
                {g.label}
              </text>
            </g>
          ))}
          {PHRASE.map((n, i) => {
            const x0 = x(beat) + 1.5;
            const x1 = x(beat + n.dur) - 1.5;
            beat += n.dur;
            const off = Math.abs(n.offsetCents) > TOLERANCE;
            return (
              <rect
                key={i}
                x={x0}
                y={y(n.semi) - 7}
                width={x1 - x0}
                height={14}
                rx={3}
                fill={off ? "#FF7A1A" : "#F8FAFC"}
                fillOpacity={off ? 0.16 : 0.1}
              />
            );
          })}
          {CURVE.map((s, i) => (
            <path
              key={i}
              d={s.d}
              fill="none"
              stroke={s.off ? "#FF7A1A" : "#20D9D2"}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              className="animate-draw-line"
              style={
                {
                  "--len": 1,
                  animationDuration: `${s.drawMs}ms`,
                  animationDelay: `${s.delayMs}ms`,
                  animationTimingFunction: "linear",
                } as CSSProperties
              }
            />
          ))}
          <text x={PAD_L} y={H - 8} fontSize={13} fill="#64748B" fontFamily="var(--font-mono)">
            0:00
          </text>
          <text x={W - PAD_R} y={H - 8} fontSize={13} fill="#64748B" textAnchor="end" fontFamily="var(--font-mono)">
            0:{String(Math.round(totalBeats * SECONDS_PER_BEAT)).padStart(2, "0")}
          </text>
        </svg>
        {live ? (
          <div
            className="pointer-events-none absolute inset-y-3 overflow-hidden"
            style={{ left: plotLeft, width: plotWidth }}
            aria-hidden
          >
            <div className="absolute inset-0 animate-scan-x">
              <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-accent/15 to-transparent" />
              <div className="absolute inset-y-0 right-0 w-px bg-accent/80" />
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pb-3 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-ink/15" aria-hidden />
          Partitura
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-accent" aria-hidden />
          Sua voz
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-flare" aria-hidden />
          Fora de ±{TOLERANCE} cents
        </span>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5">
        <div className="px-3 py-3 sm:px-5">
          <dt className="hud-label">No centro</dt>
          <dd className="text-data mt-1 text-lg font-semibold sm:text-xl">
            {IN_TUNE}
            <span className="text-sm font-normal text-ink-muted">/{PHRASE.length}</span>
          </dd>
        </div>
        <div className="px-3 py-3 sm:px-5">
          <dt className="hud-label">Desvio</dt>
          <dd className="text-data mt-1 text-lg font-semibold sm:text-xl">
            {MEAN_ABS}
            <span className="text-sm font-normal text-ink-muted"> ¢</span>
          </dd>
        </div>
        <div className="px-3 py-3 sm:px-5">
          <dt className="hud-label">Vibrato</dt>
          <dd className="text-data mt-1 text-lg font-semibold sm:text-xl">
            {String(VIBRATO_HZ).replace(".", ",")}
            <span className="text-sm font-normal text-ink-muted"> Hz</span>
          </dd>
        </div>
      </dl>
      <figcaption className="flex gap-3 border-t border-flare/20 bg-flare/10 px-5 py-3 text-sm text-ink">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-flare" aria-hidden />
        <span>
          Nota {WORST_INDEX} ({WORST.name}) ficou {Math.abs(WORST.offsetCents)} cents{" "}
          {WORST.offsetCents < 0 ? "abaixo" : "acima"}. Treine a subida com apoio antes de chegar nela.
        </span>
      </figcaption>
    </figure>
  );
}
