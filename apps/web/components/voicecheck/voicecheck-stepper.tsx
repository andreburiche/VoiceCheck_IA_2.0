"use client";

import { Check, Lock } from "lucide-react";

import type { VoiceCheckStep } from "@/lib/voicecheck-store";
import { cn } from "@/lib/utils";

const STEPS: { id: VoiceCheckStep; label: string; hint: string }[] = [
  { id: "importar", label: "Importar áudio/vídeo", hint: "Arquivo local" },
  { id: "preparar", label: "Preparar áudio", hint: "Extração e voz" },
  { id: "analisar", label: "Analisar sua voz", hint: "Afinação e ritmo" },
  { id: "resultados", label: "Ver resultados", hint: "Ocorrências" },
  { id: "melhorar", label: "Praticar e melhorar", hint: "Exercícios" },
];

const ORDER: VoiceCheckStep[] = STEPS.map((s) => s.id);

type Props = {
  step: VoiceCheckStep;
  onStepChange: (s: VoiceCheckStep) => void;
  /** Índice máximo alcançável (0-based). */
  maxReached: number;
};

/** Trilho de etapas no estilo painel de instrumentos (vertical no desktop, rolável no mobile). */
export function VoiceCheckStepper({ step, onStepChange, maxReached }: Props) {
  const current = ORDER.indexOf(step);
  const progress = Math.round(((current + 1) / STEPS.length) * 100);

  return (
    <nav
      className="panel-glass w-full min-w-0 rounded-2xl p-3 xl:sticky xl:top-24"
      aria-label="Etapas do diagnóstico"
    >
      <div className="flex items-baseline justify-between px-2">
        <p className="hud-label">Fluxo</p>
        <p className="text-data text-xs text-ink-muted">
          <span className="text-accent">{String(current + 1).padStart(2, "0")}</span>
          <span className="text-ink-faint"> / {String(STEPS.length).padStart(2, "0")}</span>
        </p>
      </div>
      <div
        className="mx-2 mt-2 h-1 overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-label="Progresso do diagnóstico"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="relative mt-3 flex gap-1 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = s.id === step;
          const locked = i > maxReached;
          return (
            <li key={s.id} className="relative min-w-[11rem] shrink-0 xl:min-w-0">
              {i < STEPS.length - 1 ? (
                <span
                  className={cn(
                    "pointer-events-none absolute left-[1.45rem] top-10 hidden h-[calc(100%-1.75rem)] w-px xl:block",
                    done ? "bg-accent/60" : "bg-line",
                  )}
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                disabled={locked}
                onClick={() => onStepChange(s.id)}
                className={cn(
                  "relative flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-200",
                  active && "bg-accent/10 ring-1 ring-inset ring-accent/30",
                  !active && !locked && "hover:bg-ink/5",
                  locked && "cursor-not-allowed opacity-45",
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "text-data mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs",
                    active && "bg-accent text-canvas shadow-glow",
                    done && !active && "bg-accent/20 text-accent",
                    !done && !active && "bg-ink/5 text-ink-faint ring-1 ring-inset ring-line",
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : locked ? (
                    <Lock className="h-3 w-3" aria-hidden />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-medium", active ? "text-ink" : "text-ink/85")}>
                    {s.label}
                  </span>
                  <span className="hud-label mt-0.5 block normal-case tracking-[0.06em]">{s.hint}</span>
                </span>
                {done ? <span className="sr-only">(concluída)</span> : null}
                {locked ? <span className="sr-only">(bloqueada)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { STEPS as VOICECHECK_STEPS, ORDER as VOICECHECK_STEP_ORDER };
