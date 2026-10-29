"use client";

import { Plus, Trash2 } from "lucide-react";

import { InfoHint } from "@/components/analysis/info-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SECTION_KINDS,
  type MusicSection,
  type SectionKind,
  newSectionId,
} from "@/lib/analysis-local";

type Props = {
  sections: MusicSection[];
  duration: number;
  currentTime: number;
  onChange: (sections: MusicSection[]) => void;
  onSeek: (t: number) => void;
};

export function SectionPanel({ sections, duration, currentTime, onChange, onSeek }: Props) {
  function add(kind: SectionKind) {
    const meta = SECTION_KINDS.find((k) => k.kind === kind)!;
    const start = Math.max(0, Number(currentTime.toFixed(2)));
    const end = Math.min(duration || start + 8, start + 8);
    onChange([
      ...sections,
      {
        id: newSectionId(),
        kind,
        label: meta.label,
        start_sec: start,
        end_sec: Math.max(start + 0.5, end),
      },
    ]);
  }

  function update(id: string, patch: Partial<MusicSection>) {
    onChange(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function remove(id: string) {
    onChange(sections.filter((s) => s.id !== id));
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-canvas-raised/90 p-4 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            Estrutura
            <InfoHint label="estrutura">
              Detecção automática de Introdução/Verso/Refrão não está disponível. Adicione seções
              manualmente; elas só aparecem quando você as define.
            </InfoHint>
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            Somente seções definidas por você · auto-detecção indisponível
          </p>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-canvas/50 px-3 py-4 text-sm text-ink-muted">
          Nenhuma seção definida. Use os botões abaixo para marcar Introdução, Verso, Refrão, Ponte
          ou Final a partir da posição atual do playhead.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Seções musicais">
          {sections
            .slice()
            .sort((a, b) => a.start_sec - b.start_sec)
            .map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-canvas/60 p-2.5"
              >
                <div className="min-w-[7rem] flex-1">
                  <Label htmlFor={`sec-label-${s.id}`} className="text-xs">
                    Nome
                  </Label>
                  <Input
                    id={`sec-label-${s.id}`}
                    value={s.label}
                    onChange={(e) => update(s.id, { label: e.target.value })}
                    className="h-8"
                  />
                </div>
                <div className="w-20">
                  <Label htmlFor={`sec-a-${s.id}`} className="text-xs">
                    Início (s)
                  </Label>
                  <Input
                    id={`sec-a-${s.id}`}
                    type="number"
                    step={0.1}
                    min={0}
                    value={s.start_sec}
                    onChange={(e) => update(s.id, { start_sec: Number(e.target.value) })}
                    className="h-8"
                  />
                </div>
                <div className="w-20">
                  <Label htmlFor={`sec-b-${s.id}`} className="text-xs">
                    Fim (s)
                  </Label>
                  <Input
                    id={`sec-b-${s.id}`}
                    type="number"
                    step={0.1}
                    min={0}
                    value={s.end_sec}
                    onChange={(e) => update(s.id, { end_sec: Number(e.target.value) })}
                    className="h-8"
                  />
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => onSeek(s.start_sec)}>
                  Ir
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Remover ${s.label}`}
                  onClick={() => remove(s.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {SECTION_KINDS.filter((k) => k.kind !== "custom").map(({ kind, label }) => (
          <Button key={kind} type="button" size="sm" variant="secondary" onClick={() => add(kind)}>
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}
