/**
 * Ponte VoiceCheck → Laboratório de Vozes (sessionStorage, mesma origem).
 * O Laboratório consome e limpa o payload ao abrir.
 */

import type { MidiNoteEvent } from "@/lib/midi-export";

const KEY = "voicecheck_lab_midi_v1";

export type PendingLabMidi = {
  title: string;
  notes: MidiNoteEvent[];
  createdAt: string;
  source: "voicecheck";
};

export function stashPendingLabMidi(payload: Omit<PendingLabMidi, "source" | "createdAt">): void {
  if (typeof sessionStorage === "undefined") return;
  const full: PendingLabMidi = {
    ...payload,
    source: "voicecheck",
    createdAt: new Date().toISOString(),
  };
  sessionStorage.setItem(KEY, JSON.stringify(full));
}

export function peekPendingLabMidi(): PendingLabMidi | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingLabMidi;
    if (!parsed?.notes?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Lê e remove o payload pendente. */
export function takePendingLabMidi(): PendingLabMidi | null {
  const p = peekPendingLabMidi();
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(KEY);
  return p;
}
