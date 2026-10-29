import { cn } from "@/lib/utils";

import { Sparkline } from "./sparkline";

/** Leitura de métrica no estilo instrumento: rótulo, valor grande, unidade, tendência. */
export function Stat({
  label,
  value,
  unit,
  hint,
  spark,
  sparkColor,
  tone = "default",
  loading,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  spark?: number[];
  sparkColor?: string;
  tone?: "default" | "flare" | "accent";
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("panel-glass flex min-w-0 flex-col rounded-2xl p-4", className)}>
      <p className="hud-label">{label}</p>
      <p
        className={cn(
          "text-data mt-2 flex items-baseline gap-1.5 text-3xl font-semibold",
          tone === "flare" ? "text-flare-soft" : tone === "accent" ? "text-accent" : "text-ink",
        )}
        aria-live="polite"
      >
        {loading ? <span className="text-ink-faint">—</span> : value}
        {unit && !loading ? <span className="text-sm font-normal text-ink-muted">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
      {spark && spark.length > 1 ? (
        <Sparkline values={spark} color={sparkColor} className="mt-3" />
      ) : null}
    </div>
  );
}
