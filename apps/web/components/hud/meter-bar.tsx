import { cn } from "@/lib/utils";

/** Barra de consumo com valor e limite. Laranja acima de `warnAt`. */
export function MeterBar({
  label,
  used,
  total,
  format = (n) => String(n),
  warnAt = 0.8,
  className,
}: {
  label: string;
  used: number;
  total: number;
  format?: (n: number) => string;
  warnAt?: number;
  className?: string;
}) {
  const ratio = total > 0 ? Math.min(1, used / total) : 0;
  const warn = ratio >= warnAt;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-ink-muted">{label}</span>
        <span className="text-data shrink-0 whitespace-nowrap text-ink">
          {format(used)} <span className="text-ink-faint">/ {format(total)}</span>
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", warn ? "bg-flare" : "bg-accent")}
          style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}
