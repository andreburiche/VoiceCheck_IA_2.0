/**
 * Síntese local de partitura — piano, violino, flauta, órgão, baixo, pad + solfejo.
 * Sem amostras proprietárias (osciladores + filtros).
 */

import { audioBufferToWav } from "@/lib/vocal-dsp";

export type SynthNote = {
  midi: number;
  startSec: number;
  durationSec: number;
};

export type SolfegeSystem = "fixed" | "movable";

export type SynthInstrument =
  | "piano"
  | "violin"
  | "flute"
  | "organ"
  | "bass"
  | "pad";

export const SYNTH_INSTRUMENTS: { id: SynthInstrument; label: string }[] = [
  { id: "piano", label: "Piano" },
  { id: "violin", label: "Violino" },
  { id: "flute", label: "Flauta" },
  { id: "organ", label: "Órgão" },
  { id: "bass", label: "Baixo" },
  { id: "pad", label: "Pad suave" },
];

const SOLFEGE_FIXED = ["Dó", "Ré", "Mi", "Fá", "Sol", "Lá", "Si"] as const;

const SYLLABLE_FORMANTS: Record<string, [number, number, number]> = {
  Dó: [500, 900, 2500],
  Ré: [450, 1800, 2500],
  Mi: [300, 2200, 3000],
  Fá: [700, 1200, 2500],
  Sol: [500, 900, 2500],
  Lá: [700, 1200, 2500],
  Si: [300, 2200, 3000],
};

const MAJOR_DEGREE_TO_SOLFEGE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 6, 6] as const;

export function midiToSolfegeFixed(midi: number): string {
  return SOLFEGE_FIXED[((midi % 12) + 12) % 12] ?? "Dó";
}

export function midiToSolfegeMovable(midi: number, tonicMidi: number): string {
  const deg = ((midi - tonicMidi) % 12 + 12) % 12;
  const idx = MAJOR_DEGREE_TO_SOLFEGE[deg] ?? 0;
  return SOLFEGE_FIXED[idx] ?? "Dó";
}

export function midiToSolfege(
  midi: number,
  system: SolfegeSystem,
  tonicMidi = 60,
): string {
  return system === "movable" ? midiToSolfegeMovable(midi, tonicMidi) : midiToSolfegeFixed(midi);
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scheduleInstrument(
  ctx: BaseAudioContext,
  dest: AudioNode,
  instrument: SynthInstrument,
  freq: number,
  when: number,
  dur: number,
) {
  const safeDur = Math.max(0.06, dur);
  const gain = ctx.createGain();
  gain.connect(dest);

  if (instrument === "piano") {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = 3200;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.2, when + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + safeDur);
    osc.connect(filter);
    filter.connect(gain);
    osc.start(when);
    osc.stop(when + safeDur + 0.05);
    return;
  }

  if (instrument === "violin") {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    filter.type = "bandpass";
    filter.frequency.value = Math.min(4000, freq * 2.2);
    filter.Q.value = 2.5;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.12, when + 0.08);
    gain.gain.setValueAtTime(0.1, when + safeDur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + safeDur);
    osc.connect(filter);
    filter.connect(gain);
    osc.start(when);
    osc.stop(when + safeDur + 0.05);
    return;
  }

  if (instrument === "flute") {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    osc.type = "sine";
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.18, when + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + safeDur);
    osc.connect(filter);
    filter.connect(gain);
    osc.start(when);
    osc.stop(when + safeDur + 0.04);
    return;
  }

  if (instrument === "organ") {
    for (const [mult, level] of [
      [1, 0.12],
      [2, 0.08],
      [3, 0.04],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(level, when + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, when + safeDur);
      osc.connect(g);
      g.connect(gain);
      osc.start(when);
      osc.stop(when + safeDur + 0.04);
    }
    gain.gain.value = 1;
    return;
  }

  if (instrument === "bass") {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = 600;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.22, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + safeDur);
    osc.connect(filter);
    filter.connect(gain);
    osc.start(when);
    osc.stop(when + safeDur + 0.05);
    return;
  }

  // pad
  for (const type of ["sine", "triangle"] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.08, when + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, when + safeDur + 0.1);
    osc.connect(g);
    g.connect(gain);
    osc.start(when);
    osc.stop(when + safeDur + 0.15);
  }
  gain.gain.value = 1;
}

function scheduleSolfegeSyllable(
  ctx: BaseAudioContext,
  dest: AudioNode,
  freq: number,
  syllable: string,
  when: number,
  dur: number,
) {
  const formants = SYLLABLE_FORMANTS[syllable] ?? SYLLABLE_FORMANTS.Dó!;
  const buzz = ctx.createOscillator();
  buzz.type = "sawtooth";
  buzz.frequency.value = freq;

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, when);
  voiceGain.gain.exponentialRampToValueAtTime(0.22, when + 0.04);
  voiceGain.gain.setValueAtTime(0.18, when + Math.max(0.05, dur * 0.55));
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.08, dur));

  const merger = ctx.createGain();
  merger.gain.value = 1;

  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = formants[i]!;
    bp.Q.value = 8 + i * 2;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.55 : i === 1 ? 0.35 : 0.2;
    buzz.connect(bp);
    bp.connect(g);
    g.connect(merger);
  }

  merger.connect(voiceGain);
  voiceGain.connect(dest);
  buzz.start(when);
  buzz.stop(when + dur + 0.06);
}

export type PlayNotesOpts = {
  onNote?: (index: number, t: number, label?: string) => void;
  speed?: number;
  /** @deprecated use instrument — mantido para calls antigas */
  kind?: "piano" | "solfege" | SynthInstrument;
  instrument?: SynthInstrument;
  solfege?: boolean;
  solfegeSystem?: SolfegeSystem;
  tonicMidi?: number;
  /** Alinha com áudio da gravação (startSec absoluto). */
  absoluteTimeline?: boolean;
  /** Começa a partir deste tempo (s) no timeline absoluto. */
  fromSec?: number;
  /** Ganho 0..1 da partitura. */
  gain?: number;
};

export class ScoreSynth {
  private ctx: AudioContext | null = null;
  private playing = false;
  private timers: number[] = [];
  private master: GainNode | null = null;

  async ensure(): Promise<AudioContext> {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state !== "running") await this.ctx.resume();
    if (!this.master) {
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  stop() {
    this.playing = false;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    // reconecta master limpo (corta notas agendadas)
    if (this.ctx && this.master) {
      try {
        this.master.disconnect();
      } catch {
        /* ignore */
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
  }

  setGain(value: number) {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, value));
  }

  async playNotes(notes: SynthNote[], opts?: PlayNotesOpts): Promise<void> {
    const ctx = await this.ensure();
    this.stop();
    this.playing = true;
    const speed = opts?.speed ?? 1;
    const useSolfege = opts?.solfege || opts?.kind === "solfege";
    const instrument: SynthInstrument =
      opts?.instrument ??
      (opts?.kind && opts.kind !== "solfege" && opts.kind !== "piano"
        ? (opts.kind as SynthInstrument)
        : "piano");
    const system = opts?.solfegeSystem ?? "fixed";
    const tonic = opts?.tonicMidi ?? 60;
    const absolute = opts?.absoluteTimeline ?? false;
    const fromSec = opts?.fromSec ?? 0;
    if (this.master) this.master.gain.value = opts?.gain ?? 1;

    const indexed = notes
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => n.startSec + n.durationSec > fromSec)
      .sort((a, b) => a.n.startSec - b.n.startSec);
    if (!indexed.length) return;

    const t0 = ctx.currentTime + 0.05;
    const origin = absolute ? fromSec : indexed[0]!.n.startSec;

    for (const { n, i } of indexed) {
      const when = t0 + Math.max(0, (n.startSec - origin) / speed);
      const endAbs = n.startSec + n.durationSec;
      const startPlay = Math.max(n.startSec, fromSec);
      const dur = Math.max(0.08, (endAbs - startPlay) / speed);
      const freq = midiToHz(n.midi);
      const label = useSolfege ? midiToSolfege(n.midi, system, tonic) : undefined;
      const dest = this.master ?? ctx.destination;

      if (useSolfege && label) {
        scheduleSolfegeSyllable(ctx, dest, freq, label, when, dur);
      } else {
        scheduleInstrument(ctx, dest, instrument, freq, when, dur);
      }

      const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
      const id = window.setTimeout(() => {
        if (this.playing) opts?.onNote?.(i, n.startSec, label);
      }, delayMs);
      this.timers.push(id);
    }

    const last = indexed[indexed.length - 1]!.n;
    const totalMs = ((last.startSec + last.durationSec - origin) / speed) * 1000 + 250;
    await new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        this.playing = false;
        resolve();
      }, totalMs);
      this.timers.push(id);
    });
  }

  async renderToWav(
    notes: SynthNote[],
    opts?: {
      kind?: "piano" | "solfege" | SynthInstrument;
      instrument?: SynthInstrument;
      solfege?: boolean;
      solfegeSystem?: SolfegeSystem;
      tonicMidi?: number;
      speed?: number;
      sampleRate?: number;
    },
  ): Promise<Blob> {
    const sorted = [...notes].sort((a, b) => a.startSec - b.startSec);
    if (!sorted.length) throw new Error("Sem notas para renderizar");

    const speed = opts?.speed ?? 1;
    const sr = opts?.sampleRate ?? 44100;
    const useSolfege = opts?.solfege || opts?.kind === "solfege";
    const instrument: SynthInstrument =
      opts?.instrument ??
      (opts?.kind && opts.kind !== "solfege" && opts.kind !== "piano"
        ? (opts.kind as SynthInstrument)
        : "piano");
    const system = opts?.solfegeSystem ?? "fixed";
    const tonic = opts?.tonicMidi ?? 60;
    const origin = sorted[0]!.startSec;
    const last = sorted[sorted.length - 1]!;
    const durationSec = (last.startSec + last.durationSec - origin) / speed + 0.3;
    const length = Math.ceil(durationSec * sr);
    const offline = new OfflineAudioContext(1, length, sr);
    const t0 = 0.05;

    for (const n of sorted) {
      const when = t0 + (n.startSec - origin) / speed;
      const dur = Math.max(0.08, n.durationSec / speed);
      const freq = midiToHz(n.midi);
      if (useSolfege) {
        const label = midiToSolfege(n.midi, system, tonic);
        scheduleSolfegeSyllable(offline, offline.destination, freq, label, when, dur);
      } else {
        scheduleInstrument(offline, offline.destination, instrument, freq, when, dur);
      }
    }

    const rendered = await offline.startRendering();
    return audioBufferToWav(rendered);
  }
}
