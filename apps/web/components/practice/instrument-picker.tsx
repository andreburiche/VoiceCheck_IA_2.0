"use client";

import {
  PRACTICE_PROFILES,
  type PracticeProfileId,
} from "@/lib/practice-profiles";
import { cn } from "@/lib/utils";

type InstrumentPickerProps = {
  value: PracticeProfileId;
  onChange: (id: PracticeProfileId) => void;
};

export function InstrumentPicker({ value, onChange }: InstrumentPickerProps) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink-faint">
        Instrumento
      </p>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Seleção de instrumento"
      >
        {PRACTICE_PROFILES.map((p) => {
          const selected = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(p.id)}
              className={cn(
                "rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors",
                selected
                  ? "border-accent bg-accent/15 text-accent shadow-glow"
                  : "border-line text-ink-muted hover:border-accent/40 hover:text-ink",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
