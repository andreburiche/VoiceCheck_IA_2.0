"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Props = {
  durationSec: number;
  annotation: string;
  onAnnotationChange: (text: string) => void;
  onSaveAnnotation: () => void;
  onLoopPlay: (fromSec: number, toSec: number) => void;
  saving?: boolean;
};

/** Fase 5 — loop por trecho + anotação de treino. */
export function VocalDrillPanel({
  durationSec,
  annotation,
  onAnnotationChange,
  onSaveAnnotation,
  onLoopPlay,
  saving,
}: Props) {
  const max = Math.max(1, durationSec);
  const [fromSec, setFromSec] = useState(0);
  const [toSec, setToSec] = useState(Math.min(8, max));

  return (
    <div className="space-y-3 rounded-2xl border border-line/70 bg-glass p-4">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-accent" />
        <h3 className="font-display text-sm font-semibold text-ink">Treino avançado</h3>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="loop-from">Início (s)</Label>
          <input
            id="loop-from"
            type="number"
            min={0}
            max={max}
            step={0.1}
            value={fromSec}
            onChange={(e) => setFromSec(Number(e.target.value) || 0)}
            className="h-9 w-24 rounded-xl border border-line bg-canvas px-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="loop-to">Fim (s)</Label>
          <input
            id="loop-to"
            type="number"
            min={0}
            max={max}
            step={0.1}
            value={toSec}
            onChange={(e) => setToSec(Number(e.target.value) || 0)}
            className="h-9 w-24 rounded-xl border border-line bg-canvas px-2 text-sm"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="violet"
          onClick={() => onLoopPlay(Math.min(fromSec, toSec), Math.max(fromSec, toSec))}
        >
          Tocar trecho
        </Button>
      </div>
      <div className="space-y-1">
        <Label htmlFor="part-note">Anotação da voz</Label>
        <textarea
          id="part-note"
          rows={2}
          value={annotation}
          onChange={(e) => onAnnotationChange(e.target.value)}
          placeholder="Ex.: atenção ao intervalo Mi–Sol no compasso 3"
          className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
        />
        <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={onSaveAnnotation}>
          {saving ? "Salvando…" : "Salvar anotação"}
        </Button>
      </div>
    </div>
  );
}
