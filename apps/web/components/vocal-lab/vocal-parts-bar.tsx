"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VocalPart } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  parts: VocalPart[];
  activePartId: string | null;
  onSelect: (partId: string) => void;
  onAdd: () => void;
  onDelete: (partId: string) => void;
  busy?: boolean;
};

export function VocalPartsBar({
  parts,
  activePartId,
  onSelect,
  onAdd,
  onDelete,
  busy,
}: Props) {
  const sorted = [...parts].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="space-y-2 rounded-2xl border border-line/70 bg-glass p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-ink-muted">
            Partes (manual · SATB)
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            Cada aba é uma linha vocal. Classifique como soprano, tenor, etc.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || parts.length >= 8}
          title="Cria uma nova linha vazia para importar ou gravar outra voz"
          onClick={onAdd}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar voz
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vozes da partitura">
        {sorted.map((p) => {
          const active = p.id === activePartId;
          return (
            <div key={p.id} className="flex items-center gap-1">
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(p.id)}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-left text-xs transition",
                  active
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-line/60 text-ink-muted hover:border-accent/30",
                )}
              >
                <span className="font-medium">{p.label}</span>
                <span className="mt-0.5 block text-xs opacity-80">
                  {p.voice_role}
                  {p.needs_review ? " · revisão" : ""} · {p.notes.length}n
                </span>
              </button>
              {parts.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remover ${p.label}`}
                  className="rounded-lg p-1.5 text-ink-faint hover:bg-signal-err/10 hover:text-signal-err"
                  disabled={busy}
                  onClick={() => onDelete(p.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ink-faint">
        Não separamos vozes de coral automaticamente — importe ou transcreva cada linha.
      </p>
    </div>
  );
}
