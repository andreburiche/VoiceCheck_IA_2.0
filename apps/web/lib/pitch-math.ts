/** Conversões de pitch — unidades explícitas, sem “nota de qualidade” subjetiva. */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function hzToMidiFloat(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function hzToMidi(hz: number): number {
  return Math.round(hzToMidiFloat(hz));
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function centsBetweenHz(sungHz: number, refHz: number): number {
  if (sungHz <= 0 || refHz <= 0) return NaN;
  return 1200 * Math.log2(sungHz / refHz);
}

export function midiToNoteName(midi: number): string {
  const m = Math.round(midi);
  const name = NOTE_NAMES[((m % 12) + 12) % 12]!;
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return "—";
  const n = Math.round(cents);
  return n > 0 ? `+${n}¢` : `${n}¢`;
}
