"use client";

import { Label } from "@/components/ui/label";
import type { VoiceFxParams } from "@/lib/live-voice-fx";

type Props = {
  value: VoiceFxParams;
  onChange: (next: VoiceFxParams) => void;
  disabled?: boolean;
};

export function VoiceFxPanel({ value, onChange, disabled }: Props) {
  function set<K extends keyof VoiceFxParams>(key: K, v: VoiceFxParams[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-violet/30 bg-violet/10 p-3">
      <div>
        <p className="font-display text-sm font-semibold text-ink">Efeitos na voz</p>
        <p className="text-xs text-ink-faint">
          Valem ao gravar (monitor) e ao ouvir o ensaio — mova os sliders e ouça na hora.
          Auto-tune é correção leve (experimental).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="fx-reverb">Reverb {Math.round(value.reverb * 100)}%</Label>
          <input
            id="fx-reverb"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value.reverb}
            disabled={disabled}
            onChange={(e) => set("reverb", Number(e.target.value))}
            className="w-full accent-[var(--violet)]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fx-delay">Delay {Math.round(value.delay * 100)}%</Label>
          <input
            id="fx-delay"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value.delay}
            disabled={disabled}
            onChange={(e) => set("delay", Number(e.target.value))}
            className="w-full accent-[var(--violet)]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fx-delay-ms">Tempo do delay {value.delayTimeMs} ms</Label>
          <input
            id="fx-delay-ms"
            type="range"
            min={80}
            max={800}
            step={10}
            value={value.delayTimeMs}
            disabled={disabled}
            onChange={(e) => set("delayTimeMs", Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fx-at">Auto-tune {Math.round(value.autotune * 100)}%</Label>
          <input
            id="fx-at"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={value.autotune}
            disabled={disabled}
            onChange={(e) => set("autotune", Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>
      </div>
    </div>
  );
}
