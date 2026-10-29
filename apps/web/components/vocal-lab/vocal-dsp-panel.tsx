"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  audioBufferToWav,
  processVocalBuffer,
  type VocalLabPreset,
} from "@/lib/vocal-dsp";
import { friendlyError } from "@/lib/errors";

type Props = {
  buffer: AudioBuffer | null;
  disabled?: boolean;
  onProcessed: (buf: AudioBuffer, wavBlob: Blob) => void;
};

/** Fase 3 — DSP experimental opcional sobre o stem Demucs (não é IA). */
export function VocalDspPanel({ buffer, disabled, onProcessed }: Props) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<VocalLabPreset>("noise");
  const [amount, setAmount] = useState(0.45);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!buffer) return;
    setBusy(true);
    setErr(null);
    try {
      const ctx = new AudioContext({ sampleRate: buffer.sampleRate });
      try {
        const out = await processVocalBuffer(ctx, buffer, { amount, preset });
        onProcessed(out, audioBufferToWav(out));
      } finally {
        await ctx.close().catch(() => undefined);
      }
    } catch (e) {
      setErr(friendlyError(e, "Falha no DSP"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line/70 bg-glass p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-sm font-medium text-ink"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 shrink-0 text-accent" />
            Limpeza de áudio (opcional)
          </span>
          {!open ? (
            <span className="pl-6 text-xs font-normal text-ink-faint">
              Reduz ruído antes de re-transcrever — experimental
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs text-ink-faint">{open ? "ocultar" : "mostrar"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3 border-t border-line/50 pt-3">
          <p className="text-xs text-ink-muted">
            Gate de ruído / high-pass simples — qualidade limitada. Aplique antes de
            re-transcrever a parte ativa.
          </p>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label htmlFor="dsp-preset">Preset</Label>
              <select
                id="dsp-preset"
                className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm"
                value={preset}
                onChange={(e) => setPreset(e.target.value as VocalLabPreset)}
              >
                <option value="noise">Ruído</option>
                <option value="ambience">Ambiência</option>
                <option value="both">Ambos</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dsp-amount">Intensidade {Math.round(amount * 100)}%</Label>
              <input
                id="dsp-amount"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-40"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!buffer || disabled || busy}
              onClick={() => void run()}
            >
              {busy ? "Processando…" : "Aplicar à voz"}
            </Button>
          </div>
          {err ? (
            <p role="alert" className="text-xs text-signal-err">
              {err}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
