import { statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const READY = new Set(["ready", "completed"]);
const BUSY = new Set(["processing", "queued", "uploading", "pending"]);

/** Status único para músicas/processamentos em todo o app. */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const tone = READY.has(status) ? "ok" : BUSY.has(status) ? "busy" : status === "failed" ? "err" : "idle";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "ok" && "bg-accent/10 text-accent",
        tone === "busy" && "bg-flare/15 text-flare-soft",
        tone === "err" && "bg-signal-err/15 text-signal-err",
        tone === "idle" && "bg-white/[0.05] text-ink-muted",
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "ok" && "bg-accent",
          tone === "busy" && "bg-flare",
          tone === "err" && "bg-signal-err",
          tone === "idle" && "bg-ink-faint",
        )}
        aria-hidden
      />
      {statusLabel(status)}
    </span>
  );
}
