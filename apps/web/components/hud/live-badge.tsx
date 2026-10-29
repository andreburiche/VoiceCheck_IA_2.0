import { cn } from "@/lib/utils";

/** Indicador "ao vivo" (laranja) ou de estado ocioso. */
export function LiveBadge({
  label = "Ao vivo",
  active = true,
  className,
}: {
  label?: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
        active ? "bg-flare/15 text-flare-soft" : "bg-canvas-overlay text-ink-muted",
        className,
      )}
    >
      <span className="relative inline-flex h-2 w-2" aria-hidden>
        {active ? <span className="absolute inset-0 rounded-full bg-flare animate-live-ping" /> : null}
        <span className={cn("relative h-2 w-2 rounded-full", active ? "bg-flare" : "bg-ink-faint")} />
      </span>
      {label}
    </span>
  );
}
