"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MidiNoteEvent } from "@/lib/midi-export";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

function midiLabel(midi: number) {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12]!;
  return `${name}${Math.floor(midi / 12) - 1}`;
}

type Props = {
  notes: MidiNoteEvent[];
  title: string;
  onTitleChange: (t: string) => void;
  onNotesChange: (notes: MidiNoteEvent[]) => void;
  onSave: () => void;
  onUse: () => void;
  onOpenLab: () => void;
  onCancel: () => void;
  saving?: boolean;
};

/** Corrige notas/durações da referência criada a partir da gravação. */
export function VoiceCheckReferenceEditor({
  notes,
  title,
  onTitleChange,
  onNotesChange,
  onSave,
  onUse,
  onOpenLab,
  onCancel,
  saving,
}: Props) {
  const [active, setActive] = useState(0);
  const note = notes[active] ?? null;
  const summary = useMemo(
    () => `${notes.length} notas · ${formatClock(notes.at(-1)?.startSec ?? 0)}`,
    [notes],
  );

  function patch(i: number, partial: Partial<MidiNoteEvent>) {
    onNotesChange(notes.map((n, idx) => (idx === i ? { ...n, ...partial } : n)));
  }

  function remove(i: number) {
    const next = notes.filter((_, idx) => idx !== i);
    onNotesChange(next);
    setActive((a) => Math.min(a, Math.max(0, next.length - 1)));
  }

  if (!note) {
    return (
      <section className="rounded-2xl border border-signal-warn/40 bg-signal-warn/5 p-4 text-sm text-ink-muted">
        Nenhuma nota para editar.
        <Button type="button" size="sm" variant="ghost" className="ml-2" onClick={onCancel}>
          Fechar
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-accent/35 bg-accent/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-sm font-semibold text-ink">Corrigir referência</h4>
        <p className="text-data text-xs text-ink-faint">{summary}</p>
      </div>
      <p className="text-xs text-ink-muted">
        Ajuste altura e duração antes de salvar. Variações artísticas ficam a seu critério — o
        sistema não marca erro aqui.
      </p>

      <div className="space-y-1">
        <Label htmlFor="ref-title" className="text-xs text-ink-faint">
          Nome
        </Label>
        <input
          id="ref-title"
          className="h-9 w-full max-w-md rounded-xl border border-line bg-canvas-raised px-3 text-sm"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </div>

      <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
        {notes.map((n, i) => (
          <button
            key={`${n.startSec}-${i}`}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              "rounded-lg border px-2 py-1 font-mono text-xs",
              i === active
                ? "border-accent/50 bg-accent/20 text-accent"
                : "border-line text-ink-muted",
            )}
          >
            {midiLabel(n.midi)}
          </button>
        ))}
      </div>

      <div className="space-y-2 rounded-xl border border-line/60 bg-canvas/30 p-3">
        <p className="text-data text-xs text-ink">
          #{active + 1} · {midiLabel(note.midi)} · {formatClock(note.startSec)} ·{" "}
          {note.durationSec.toFixed(2)}s
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => patch(active, { midi: Math.max(36, note.midi - 1) })}
          >
            −1 st
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => patch(active, { midi: Math.min(84, note.midi + 1) })}
          >
            +1 st
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => patch(active, { midi: Math.max(36, note.midi - 12) })}
          >
            −oit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => patch(active, { midi: Math.min(84, note.midi + 12) })}
          >
            +oit
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => remove(active)}>
            Apagar
          </Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ref-dur" className="text-xs text-ink-faint">
            Duração {note.durationSec.toFixed(2)}s
          </Label>
          <input
            id="ref-dur"
            type="range"
            min={0.05}
            max={4}
            step={0.05}
            value={Math.min(4, Math.max(0.05, note.durationSec))}
            onChange={(e) => patch(active, { durationSec: Number(e.target.value) })}
            className="h-3 w-full max-w-md accent-[var(--accent)]"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving || notes.length < 1} onClick={onSave}>
          {saving ? "Salvando…" : "Salvar referência"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onUse}>
          Usar nesta análise
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onOpenLab}>
          Abrir no Laboratório
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}
