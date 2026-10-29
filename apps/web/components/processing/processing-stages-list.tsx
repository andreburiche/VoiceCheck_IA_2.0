import { Check, Circle, Loader2, X } from "lucide-react";

import type { ProcessingStage } from "@/lib/processing-stages";
import { cn } from "@/lib/utils";

type ProcessingStagesListProps = {
  stages: ProcessingStage[];
};

export function ProcessingStagesList({ stages }: ProcessingStagesListProps) {
  return (
    <ol className="mx-auto w-full max-w-sm space-y-2" aria-label="Etapas do processamento">
      {stages.map((stage) => (
        <li
          key={stage.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
            stage.state === "running" && "border-accent/40 bg-accent/10 text-ink",
            stage.state === "done" && "border-line bg-canvas/40 text-ink-muted",
            stage.state === "wait" && "border-transparent text-ink-faint",
            stage.state === "error" && "border-signal-err/40 bg-signal-err/10 text-signal-err",
          )}
        >
          <StageIcon state={stage.state} />
          <span className={cn(stage.state === "running" && "font-medium text-accent")}>{stage.label}</span>
        </li>
      ))}
    </ol>
  );
}

function StageIcon({ state }: { state: ProcessingStage["state"] }) {
  if (state === "done") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-accent">
        <Check className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Concluído</span>
      </span>
    );
  }
  if (state === "running") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet/20 text-violet">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        <span className="sr-only">Em execução</span>
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-signal-err/20 text-signal-err">
        <X className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Falhou</span>
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center text-ink-faint">
      <Circle className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Aguardando</span>
    </span>
  );
}
