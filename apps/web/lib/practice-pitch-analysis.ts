/**
 * Comparação ensaio × referência (F0 YIN + onsets).
 * Só emite eventos com medições verificáveis — nunca inventa erros.
 */

import { estimateNotesFromBuffer, type MidiNoteEvent } from "@/lib/midi-export";
import {
  centsBetweenHz,
  formatCents,
  hzToMidiFloat,
  midiToHz,
  midiToNoteName,
} from "@/lib/pitch-math";
import { estimatePitchFrames, type PitchFrame } from "@/lib/pitch-yin-frames";

export type PitchDeviationKind =
  | "sharp"
  | "flat"
  | "in_tolerance"
  | "transition"
  | "unvoiced_gap";

export type RhythmDeviationKind = "early" | "late" | "ok";

export type PitchObservation = {
  /** Tempo na timeline da música (s). */
  songSec: number;
  sungHz: number;
  refHz: number;
  sungMidi: number;
  refMidi: number;
  cents: number;
  corr: number;
  kind: PitchDeviationKind;
};

export type RhythmObservation = {
  songSec: number;
  deltaMs: number;
  kind: RhythmDeviationKind;
  sungMidi: number;
  refMidi: number;
  /** Confiança 0..1 (proximidade + duração mínima). */
  confidence: number;
};

export type PitchFeedbackEvent = {
  id: string;
  type: "pitch" | "rhythm";
  songSec: number;
  endSec?: number;
  kind: string;
  measured: string;
  refNote: string;
  sungNote: string | null;
  confidence: number;
  explanation: string;
};

export type PracticePitchAnalysis = {
  algorithm: "client_yin_v1";
  version: 1;
  toleranceCents: number;
  rhythmTolMs: number;
  /** Frames vozeados do aluno com confiança mínima. */
  voicedFrames: number;
  /** % de frames vozeados dentro da tolerância (exclui transições). */
  inTolerancePct: number | null;
  pitchEvents: PitchFeedbackEvent[];
  rhythmEvents: PitchFeedbackEvent[];
  /** Amostras para o gráfico (subsample). */
  chartPoints: {
    songSec: number;
    sungMidi: number | null;
    refMidi: number | null;
    cents: number | null;
    inTol: boolean;
  }[];
  refSource: "lab_notes" | "vocals_stem_yin";
  takeOffsetSec: number;
  analyzedAt: string;
};

export type LabNoteRef = {
  pitch_midi: number;
  start_ms: number;
  end_ms: number;
};

function refHzAtSongTime(
  songSec: number,
  labNotes: LabNoteRef[] | null,
  refFrames: PitchFrame[] | null,
  takeOffsetSec: number,
): { hz: number; midi: number; source: "lab" | "yin" } | null {
  if (labNotes?.length) {
    const ms = songSec * 1000;
    const n = labNotes.find((x) => ms >= x.start_ms && ms < x.end_ms);
    if (n) return { hz: midiToHz(n.pitch_midi), midi: n.pitch_midi, source: "lab" };
  }
  if (refFrames?.length) {
    const localT = songSec - takeOffsetSec;
    // ref frames are relative to vocals stem start (= song 0 typically)
    let best: PitchFrame | null = null;
    let bestDt = Infinity;
    for (const f of refFrames) {
      if (f.hz == null) continue;
      const dt = Math.abs(f.tSec - songSec);
      if (dt < bestDt) {
        bestDt = dt;
        best = f;
      }
    }
    if (best?.hz != null && bestDt <= 0.08) {
      return { hz: best.hz, midi: best.midi ?? hzToMidiFloat(best.hz), source: "yin" };
    }
    void localT;
  }
  return null;
}

function isNearNoteBoundary(songSec: number, labNotes: LabNoteRef[] | null, windowSec = 0.12): boolean {
  if (!labNotes?.length) return false;
  const ms = songSec * 1000;
  const w = windowSec * 1000;
  return labNotes.some(
    (n) => Math.abs(ms - n.start_ms) < w || Math.abs(ms - n.end_ms) < w,
  );
}

function meanMidiStability(frames: PitchFrame[], from: number, to: number): number {
  const mids: number[] = [];
  for (const f of frames) {
    if (f.midi == null || f.tSec < from || f.tSec > to) continue;
    mids.push(f.midi);
  }
  if (mids.length < 3) return 0;
  const mean = mids.reduce((a, b) => a + b, 0) / mids.length;
  const var_ = mids.reduce((a, b) => a + (b - mean) ** 2, 0) / mids.length;
  return Math.sqrt(var_);
}

export type AnalyzeOpts = {
  takeBuffer: AudioBuffer;
  /** Stem vocals ou guia — timeline da música desde 0. */
  refBuffer?: AudioBuffer | null;
  labNotes?: LabNoteRef[] | null;
  takeOffsetSec: number;
  toleranceCents?: number;
  rhythmTolMs?: number;
  minCorr?: number;
};

export function analyzePracticeTake(opts: AnalyzeOpts): PracticePitchAnalysis {
  const toleranceCents = opts.toleranceCents ?? 50;
  const rhythmTolMs = opts.rhythmTolMs ?? 80;
  const minCorr = opts.minCorr ?? 0.35;
  const offset = opts.takeOffsetSec;

  const sungFrames = estimatePitchFrames(opts.takeBuffer, { minCorr: 0.25 });
  const refFrames = opts.refBuffer
    ? estimatePitchFrames(opts.refBuffer, { minCorr: 0.25 })
    : null;
  const labNotes = opts.labNotes?.length ? opts.labNotes : null;
  const refSource: PracticePitchAnalysis["refSource"] = labNotes
    ? "lab_notes"
    : "vocals_stem_yin";

  const chartPoints: PracticePitchAnalysis["chartPoints"] = [];
  const pitchObs: PitchObservation[] = [];
  let voiced = 0;
  let inTol = 0;
  let scored = 0;

  for (const f of sungFrames) {
    const songSec = offset + f.tSec;
    if (f.hz == null || f.corr < minCorr) {
      chartPoints.push({
        songSec,
        sungMidi: null,
        refMidi: null,
        cents: null,
        inTol: false,
      });
      continue;
    }
    voiced += 1;
    const ref = refHzAtSongTime(songSec, labNotes, refFrames, offset);
    if (!ref) {
      chartPoints.push({
        songSec,
        sungMidi: f.midi,
        refMidi: null,
        cents: null,
        inTol: false,
      });
      continue;
    }
    const cents = centsBetweenHz(f.hz, ref.hz);
    if (!Number.isFinite(cents)) continue;
    const nearBoundary = isNearNoteBoundary(songSec, labNotes);
    const abs = Math.abs(cents);
    let kind: PitchDeviationKind;
    if (nearBoundary && abs > toleranceCents) {
      kind = "transition";
    } else if (abs <= toleranceCents) {
      kind = "in_tolerance";
    } else if (cents > 0) {
      kind = "sharp";
    } else {
      kind = "flat";
    }

    if (kind !== "transition") {
      scored += 1;
      if (kind === "in_tolerance") inTol += 1;
    }

    pitchObs.push({
      songSec,
      sungHz: f.hz,
      refHz: ref.hz,
      sungMidi: f.midi ?? hzToMidiFloat(f.hz),
      refMidi: ref.midi,
      cents,
      corr: f.corr,
      kind,
    });
    chartPoints.push({
      songSec,
      sungMidi: f.midi,
      refMidi: ref.midi,
      cents,
      inTol: kind === "in_tolerance" || kind === "transition",
    });
  }

  // Agrupa desvios persistentes (≥3 frames consecutivos fora da tolerância)
  const pitchEvents = clusterPitchEvents(pitchObs, toleranceCents, sungFrames, offset);

  // Ritmo: onsets de notas
  const sungNotes = estimateNotesFromBuffer(opts.takeBuffer);
  const refNotes: MidiNoteEvent[] = labNotes
    ? labNotes.map((n) => ({
        midi: n.pitch_midi,
        startSec: n.start_ms / 1000,
        durationSec: Math.max(0.05, (n.end_ms - n.start_ms) / 1000),
        velocity: 80,
      }))
    : opts.refBuffer
      ? estimateNotesFromBuffer(opts.refBuffer)
      : [];

  const rhythmEvents = matchRhythmEvents(sungNotes, refNotes, offset, rhythmTolMs);

  // Subsample chart (~400 pts max)
  const step = Math.max(1, Math.floor(chartPoints.length / 400));
  const chart =
    step <= 1 ? chartPoints : chartPoints.filter((_, i) => i % step === 0);

  return {
    algorithm: "client_yin_v1",
    version: 1,
    toleranceCents,
    rhythmTolMs,
    voicedFrames: voiced,
    inTolerancePct: scored > 0 ? Math.round((1000 * inTol) / scored) / 10 : null,
    pitchEvents,
    rhythmEvents,
    chartPoints: chart,
    refSource,
    takeOffsetSec: offset,
    analyzedAt: new Date().toISOString(),
  };
}

function clusterPitchEvents(
  obs: PitchObservation[],
  toleranceCents: number,
  sungFrames: PitchFrame[],
  offset: number,
): PitchFeedbackEvent[] {
  const events: PitchFeedbackEvent[] = [];
  let run: PitchObservation[] = [];

  const flush = () => {
    if (run.length < 3) {
      run = [];
      return;
    }
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const meanCents =
      run.reduce((a, o) => a + o.cents, 0) / run.length;
    const meanCorr = run.reduce((a, o) => a + o.corr, 0) / run.length;
    const kind = meanCents > 0 ? "sharp" : "flat";
    const localFrom = first.songSec - offset;
    const localTo = last.songSec - offset;
    const stab = meanMidiStability(sungFrames, localFrom, localTo);
    // Estabilidade alta + desvio = erro persistente (não só transição)
    const confidence = Math.min(
      0.95,
      0.35 + meanCorr * 0.4 + Math.min(0.25, run.length / 40) + (stab < 0.6 ? 0.1 : 0),
    );
    if (confidence < 0.45) {
      run = [];
      return;
    }
    const refNote = midiToNoteName(first.refMidi);
    const sungNote = midiToNoteName(first.sungMidi);
    events.push({
      id: `pitch_${first.songSec.toFixed(2)}_${kind}`,
      type: "pitch",
      songSec: first.songSec,
      endSec: last.songSec,
      kind,
      measured: formatCents(meanCents),
      refNote,
      sungNote,
      confidence: Math.round(confidence * 100) / 100,
      explanation: buildPitchExplanation(
        first.songSec,
        last.songSec,
        kind,
        meanCents,
        refNote,
        sungNote,
        toleranceCents,
      ),
    });
    run = [];
  };

  for (const o of obs) {
    if (o.kind === "sharp" || o.kind === "flat") {
      if (run.length && Math.abs(o.songSec - run[run.length - 1]!.songSec) > 0.2) flush();
      run.push(o);
    } else {
      flush();
    }
  }
  flush();
  return events.slice(0, 40);
}

function buildPitchExplanation(
  start: number,
  end: number,
  kind: string,
  cents: number,
  refNote: string,
  sungNote: string,
  tol: number,
): string {
  const t0 = start.toFixed(1);
  const t1 = end.toFixed(1);
  const dir = kind === "sharp" ? "acima" : "abaixo";
  return `Entre ${t0}s e ${t1}s, a F0 estimada ficou em média ${formatCents(cents)} (${dir}) da referência ${refNote} (você ≈ ${sungNote}). Tolerância configurada: ±${tol}¢. Medição YIN local — revise ouvindo o trecho.`;
}

function matchRhythmEvents(
  sung: MidiNoteEvent[],
  ref: MidiNoteEvent[],
  offsetSec: number,
  tolMs: number,
): PitchFeedbackEvent[] {
  if (!sung.length || !ref.length) return [];
  const used = new Set<number>();
  const out: PitchFeedbackEvent[] = [];

  for (const s of sung) {
    const songOnset = offsetSec + s.startSec;
    let bestI = -1;
    let bestAbs = Infinity;
    for (let i = 0; i < ref.length; i++) {
      if (used.has(i)) continue;
      const r = ref[i]!;
      const dt = (songOnset - r.startSec) * 1000;
      const a = Math.abs(dt);
      if (a < bestAbs) {
        bestAbs = a;
        bestI = i;
      }
    }
    if (bestI < 0 || bestAbs > 500) continue;
    used.add(bestI);
    const r = ref[bestI]!;
    const deltaMs = Math.round((songOnset - r.startSec) * 1000);
    let kind: RhythmDeviationKind = "ok";
    if (deltaMs < -tolMs) kind = "early";
    else if (deltaMs > tolMs) kind = "late";
    if (kind === "ok") continue;

    const confidence = Math.min(
      0.9,
      0.4 + (1 - bestAbs / 500) * 0.4 + Math.min(0.15, s.durationSec),
    );
    if (confidence < 0.5) continue;

    const dir = kind === "early" ? "antes" : "depois";
    out.push({
      id: `rhythm_${songOnset.toFixed(2)}_${kind}`,
      type: "rhythm",
      songSec: songOnset,
      kind,
      measured: `${deltaMs > 0 ? "+" : ""}${deltaMs} ms`,
      refNote: midiToNoteName(r.midi),
      sungNote: midiToNoteName(s.midi),
      confidence: Math.round(confidence * 100) / 100,
      explanation: `Aos ${songOnset.toFixed(1)}s, a entrada estimada ficou aproximadamente ${Math.abs(deltaMs)} ms ${dir} da referência (${midiToNoteName(r.midi)}). Tolerância: ±${tolMs} ms. Alinhamento por onsets YIN — ouça o trecho para confirmar.`,
    });
  }
  return out.slice(0, 30);
}
