"use client";


type ProcessingRingProps = {
  progress: number | null;
  active?: boolean;
  label?: string;
};

/** Anel com waveform colorida — percentual só se `progress` mensurável. */
export function ProcessingRing({ progress, active, label }: ProcessingRingProps) {
  const pct = progress ?? 0;
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = progress == null ? 0 : (pct / 100) * c;

  return (
    <div className="relative mx-auto flex h-56 w-56 items-center justify-center" role="img" aria-label={label}>
      <svg viewBox="0 0 140 140" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(var(--c-line) / 0.9)" strokeWidth="8" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="url(#procGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className="transition-[stroke-dasharray] duration-500"
        />
        <defs>
          <linearGradient id="procGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(var(--c-accent))" />
            <stop offset="100%" stopColor="rgb(var(--c-accent))" />
          </linearGradient>
        </defs>
      </svg>


      <div className="relative z-10 text-center">
        {progress != null ? (
          <>
            <p className="text-4xl font-semibold tabular-nums text-ink">{Math.round(pct)}%</p>
            <p className="mt-1 text-xs text-ink-faint">progresso</p>
          </>
        ) : (
          <>
            <p className="text-lg font-medium text-ink">Em fila</p>
            <p className="mt-1 text-xs text-ink-faint">na fila</p>
          </>
        )}
      </div>
    </div>
  );
}
