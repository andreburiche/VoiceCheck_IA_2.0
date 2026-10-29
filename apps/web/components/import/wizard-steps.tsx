import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Arquivo" },
  { id: 2, label: "Informações" },
  { id: 3, label: "Modelo de IA" },
  { id: 4, label: "Confirmar" },
] as const;

type WizardStepsProps = {
  current: number;
};

export function WizardSteps({ current }: WizardStepsProps) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Etapas da importação">
      {STEPS.map((step, idx) => {
        const active = step.id === current;
        const done = step.id < current;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {idx > 0 ? <span className="hidden h-px w-4 bg-line sm:block" aria-hidden /> : null}
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                active && "border-accent/50 bg-accent/15 text-accent",
                done && "border-violet/40 bg-violet/10 text-violet",
                !active && !done && "border-line text-ink-faint",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span className="font-mono">{step.id}</span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
