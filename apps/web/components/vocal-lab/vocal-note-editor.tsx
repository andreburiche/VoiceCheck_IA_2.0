"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { midiToSolfege, type SolfegeSystem } from "@/lib/score-synth";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

function midiLabel(midi: number) {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12]!;
  const oct = Math.floor(midi / 12) - 1;
  return `${name}${oct}`;
}

type Props = {
  index: number;
  midi: number;
  startSec: number;
  durationSec: number;
  solfegeSystem: SolfegeSystem;
  tonicMidi: number;
  onChangeMidi: (midi: number) => void;
  onChangeDuration: (sec: number) => void;
  onDelete: () => void;
  onPreview: () => void;
  onSave: () => void;
  saving?: boolean;
};

/** Edição da nota selecionada na pauta. */
export function VocalNoteEditor({
  index,
  midi,
  startSec,
  durationSec,
  solfegeSystem,
  tonicMidi,
  onChangeMidi,
  onChangeDuration,
  onDelete,
  onPreview,
  onSave,
  saving,
}: Props) {
  const solf = midiToSolfege(midi, solfegeSystem, tonicMidi);

  return (
    <div className="space-y-3 rounded-2xl border border-violet/35 bg-violet/10 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-ink">Editar nota #{index + 1}</h3>
        <p className="font-mono text-xs text-ink-muted">
          {midiLabel(midi)} · MIDI {midi} · {solf} · {startSec.toFixed(2)}s
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => onChangeMidi(midi - 1)}>
          −1 semitom
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => onChangeMidi(midi + 1)}>
          +1 semitom
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChangeMidi(midi - 12)}>
          −1 oitava
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChangeMidi(midi + 12)}>
          +1 oitava
        </Button>
        <Button type="button" size="sm" variant="default" onClick={onPreview}>
          Ouvir nota
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="note-dur">Duração ({durationSec.toFixed(2)}s)</Label>
        <input
          id="note-dur"
          type="range"
          min={0.05}
          max={4}
          step={0.05}
          value={Math.min(4, Math.max(0.05, durationSec))}
          onChange={(e) => onChangeDuration(Number(e.target.value))}
          className="w-full max-w-md accent-[var(--violet)]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="violet" disabled={saving} onClick={onSave}>
          {saving ? "Salvando…" : "Salvar na partitura"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          Apagar nota
        </Button>
      </div>
      <p className="text-xs text-ink-faint">
        Clique numa nota da pauta para selecionar. Ajuste a altura se estiver fora do pentagrama.
      </p>
    </div>
  );
}
