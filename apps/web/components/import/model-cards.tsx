"use client";

import { Check, Cpu, CircuitBoard } from "lucide-react";

import type { SeparationModelInfo } from "@/lib/api";
import { cn } from "@/lib/utils";

type ModelCardsProps = {
  models: SeparationModelInfo[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
  gpuAvailable?: boolean;
  cpuCount?: number;
};

export function ModelCards({
  models,
  selectedCode,
  onSelect,
  gpuAvailable,
  cpuCount,
}: ModelCardsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
          <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden />
          CPU {cpuCount != null ? `${cpuCount} núcleos` : "—"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
          <CircuitBoard className="h-3.5 w-3.5 text-violet" aria-hidden />
          GPU {gpuAvailable ? "disponível" : "não detectada / CPU"}
        </span>
      </div>

      <ul className="grid gap-3 md:grid-cols-3" role="listbox" aria-label="Modelos de separação">
        {models.map((m) => {
          const selected = selectedCode === m.code;
          const disabled = !m.selectable;
          return (
            <li key={m.code}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => onSelect(m.code)}
                className={cn(
                  "relative flex h-full w-full flex-col gap-2 rounded-2xl border p-4 text-left transition-colors",
                  selected && !disabled && "border-accent bg-accent/10 shadow-glow",
                  !selected && !disabled && "border-line bg-canvas-raised/80 hover:border-accent/40",
                  disabled && "cursor-not-allowed border-line bg-canvas/40 opacity-55",
                )}
              >
                {selected && !disabled ? (
                  <span className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-canvas">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : null}
                <p className="pr-8 text-sm font-semibold text-ink">
                  {m.label}
                  {m.recommended ? (
                    <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 align-middle text-xs font-medium text-accent">
                      Recomendado
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-ink-muted">{m.description}</p>
                <p className="text-xs text-ink-faint">
                  {m.stems.length} faixas
                  {m.min_vram_mb ? ` · placa de vídeo com ${Math.round(m.min_vram_mb / 1024)} GB ou mais (opcional)` : ""}
                </p>
                <p className={cn("mt-auto text-xs", disabled ? "text-signal-warn" : "text-accent")}>
                  {m.reason}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
