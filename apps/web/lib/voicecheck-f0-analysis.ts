/**
 * Análise F0 no client (mesmo contrato JSON da API) — offline / fallback.
 * Usa YIN já existente; sem classificação de erro de afinação.
 */

import { hzToMidiFloat, midiToNoteName } from "@/lib/pitch-math";
import { estimatePitchFrames } from "@/lib/pitch-yin-frames";
import { decodeArrayBuffer } from "@/lib/vocal-dsp";

export type VoiceCheckF0Point = {
  time_seconds: number;
  frequency_hz: number | null;
  midi_note: number | null;
  note_name: string | null;
  is_valid: boolean;
  confidence: number | null;
  rms?: number;
};

export type VoiceCheckEvent = {
  id: string;
  category: string;
  start_seconds: number;
  end_seconds: number;
  title?: string;
  description: string;
  evidence?: Record<string, unknown>;
  confidence?: number | null;
  recommendation_key?: string | null;
  severity?: string;
  guidance?: string;
  exercise?: string;
  playback?: { start_seconds: number; end_seconds: number };
};

export type VoiceCheckPositive = {
  id: string;
  key: string;
  title: string;
  description: string;
  evidence?: Record<string, unknown>;
  start_seconds?: number | null;
  end_seconds?: number | null;
  confidence?: number | null;
};

export type VoiceCheckRecommendation = {
  key: string;
  title: string;
  text: string;
  exercise?: string;
  disclaimer?: string;
  start_seconds?: number;
  end_seconds?: number;
};

export type VoiceCheckF0Report = {
  analysis_version: string;
  duration_seconds: number;
  sample_rate: number;
  algorithm: string;
  processing_engine?: string;
  parameters: Record<string, number>;
  pitch_track: VoiceCheckF0Point[];
  pitch?: {
    median_hz?: number | null;
    valid_frames_percentage?: number | null;
  };
  observed_range: {
    min_hz: number | null;
    max_hz: number | null;
    median_hz: number | null;
    span_semitones: number | null;
    disclaimer?: string;
    note?: string;
  };
  statistics: {
    valid_frame_percent: number;
    valid_frames: number;
    total_frames: number;
    predominant_hz: number | null;
    predominant_note_name: string | null;
    note_histogram: Record<string, number>;
    stable_region_variation_cents_median: number | null;
    vibrato_note?: string;
  };
  analyzable_regions: { start_seconds: number; end_seconds: number }[];
  technical_analysis?: Record<string, VoiceCheckEvent[]>;
  events?: VoiceCheckEvent[];
  positive_findings?: VoiceCheckPositive[];
  recommendations?: VoiceCheckRecommendation[];
  mode?: string;
  reference_mode?: string | null;
  reference_type?: string | null;
  reference_quality?: string | null;
  selected_vocal_part?: string | null;
  detected_transposition?: number | null;
  alignment_status?: string | null;
  comparison?: {
    pitch?: { within_tolerance_percent?: number; mean_abs_cents?: number };
    rhythm?: { within_tolerance_percent?: number; mean_abs_onset_ms?: number };
    duration?: Record<string, unknown>;
  };
  comparison_events?: VoiceCheckEvent[];
  technical_events?: VoiceCheckEvent[];
  melodic_consistency_events?: VoiceCheckEvent[];
  melodic_consistency?: Record<string, unknown>;
  warnings: string[];
  no_reference: boolean;
  disclaimer: string;
  /** Presente só no fallback do navegador */
  client_fallback?: boolean;
};

const DISCLAIMER =
  "Esta análise descreve características acústicas observadas na gravação. Para identificar notas cantadas incorretamente, será necessário comparar sua execução com uma referência musical.";

export type ClientF0Params = {
  fminHz?: number;
  fmaxHz?: number;
  hopSec?: number;
  minCorr?: number;
};

export async function analyzePreparedWavBlob(
  wav: Blob,
  params?: ClientF0Params,
): Promise<VoiceCheckF0Report> {
  const ctx = new AudioContext();
  try {
    const buf = await decodeArrayBuffer(ctx, await wav.arrayBuffer());
    return analyzeAudioBuffer(buf, params);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export function analyzeAudioBuffer(
  buffer: AudioBuffer,
  params?: ClientF0Params,
): VoiceCheckF0Report {
  const fmin = params?.fminHz ?? 65;
  const fmax = params?.fmaxHz ?? 1100;
  const hopSec = params?.hopSec ?? 0.05;
  const minCorr = params?.minCorr ?? 0.35;

  const raw = estimatePitchFrames(buffer, {
    hopSec,
    minHz: fmin,
    maxHz: fmax,
    minCorr: 0.25,
    minAmp: 0.008,
  });

  // Octave jump filter
  const frames: VoiceCheckF0Point[] = [];
  let prevHz: number | null = null;
  for (const f of raw) {
    const t = f.tSec;
    if (f.hz == null || f.corr < minCorr) {
      frames.push({
        time_seconds: round4(t),
        frequency_hz: null,
        midi_note: null,
        note_name: null,
        is_valid: false,
        confidence: f.corr > 0 ? round4(f.corr) : null,
      });
      prevHz = null;
      continue;
    }
    if (prevHz != null) {
      const r = Math.max(f.hz, prevHz) / Math.min(f.hz, prevHz);
      if (r >= 1.85) {
        frames.push({
          time_seconds: round4(t),
          frequency_hz: null,
          midi_note: null,
          note_name: null,
          is_valid: false,
          confidence: round4(f.corr),
        });
        prevHz = null;
        continue;
      }
    }
    const midi = hzToMidiFloat(f.hz);
    frames.push({
      time_seconds: round4(t),
      frequency_hz: round3(f.hz),
      midi_note: round3(midi),
      note_name: midiToNoteName(midi),
      is_valid: true,
      confidence: round4(Math.min(1, f.corr)),
    });
    prevHz = f.hz;
  }

  const valid = frames.filter((p) => p.is_valid && p.frequency_hz != null);
  const warnings: string[] = [];
  const validPct = frames.length ? (100 * valid.length) / frames.length : 0;
  if (buffer.duration < 0.25) warnings.push("Gravação muito curta; estatísticas têm baixa representatividade.");
  if (validPct < 15 && frames.length > 0) {
    warnings.push(
      "Poucos frames com F0 confiável — silêncio, ruído ou material fora da faixa configurada.",
    );
  }
  if (valid.length === 0) warnings.push("Nenhuma frequência fundamental válida detectada.");

  const hzVals = valid.map((v) => v.frequency_hz!);
  const hist: Record<string, number> = {};
  for (const v of valid) {
    if (!v.note_name) continue;
    hist[v.note_name] = (hist[v.note_name] ?? 0) + 1;
  }
  const predominant =
    Object.entries(hist).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    null;
  let predominantHz: number | null = null;
  if (predominant) {
    const matching = valid.filter((v) => v.note_name === predominant).map((v) => v.frequency_hz!);
    predominantHz = median(matching);
  }

  let observed_range: VoiceCheckF0Report["observed_range"];
  if (hzVals.length === 0) {
    observed_range = {
      min_hz: null,
      max_hz: null,
      median_hz: null,
      span_semitones: null,
      note: "Sem F0 válido — não há extensão observada.",
    };
  } else {
    const minH = Math.min(...hzVals);
    const maxH = Math.max(...hzVals);
    observed_range = {
      min_hz: round2(minH),
      max_hz: round2(maxH),
      median_hz: round2(median(hzVals)!),
      span_semitones: round2(12 * Math.log2(maxH / Math.max(minH, 1e-9))),
      disclaimer:
        "Extensão observada nesta gravação — não é a extensão vocal máxima do cantor.",
    };
  }

  // subsample track
  let track = frames;
  if (track.length > 800) {
    const step = Math.max(1, Math.floor(track.length / 800));
    track = track.filter((_, i) => i % step === 0);
  }

  warnings.push(
    "Fallback do navegador (client_yin_v1): só estatísticas F0. Ocorrências técnicas exigem o motor Python (API).",
  );

  return {
    analysis_version: "voicecheck_f0_v1",
    duration_seconds: round3(buffer.duration),
    sample_rate: buffer.sampleRate,
    algorithm: "client_yin_v1",
    processing_engine: "browser_fallback",
    client_fallback: true,
    mode: "without_reference",
    parameters: {
      fmin_hz: fmin,
      fmax_hz: fmax,
      hop_sec: hopSec,
      min_corr: minCorr,
    },
    pitch_track: track,
    pitch: {
      median_hz: observed_range.median_hz,
      valid_frames_percentage: round2(validPct),
    },
    observed_range,
    statistics: {
      valid_frame_percent: round2(validPct),
      valid_frames: valid.length,
      total_frames: frames.length,
      predominant_hz: predominantHz != null ? round2(predominantHz) : null,
      predominant_note_name: predominant,
      note_histogram: hist,
      stable_region_variation_cents_median: stableVariationCents(valid),
      vibrato_note:
        "Variação em regiões estáveis não é classificada como desafinação; vibrato/portamento podem aparecer como oscilação.",
    },
    analyzable_regions: analyzableRegions(frames),
    events: [],
    positive_findings: [],
    recommendations: [],
    technical_analysis: {
      voice_breaks: [],
      stability: [],
      breathing: [],
      vibrato: [],
      dynamics: [],
      phrasing: [],
    },
    reference_mode: "authorial",
    alignment_status: "not_applicable",
    comparison_events: [],
    technical_events: [],
    melodic_consistency_events: [],
    warnings,
    no_reference: true,
    disclaimer: DISCLAIMER,
  };
}

function analyzableRegions(frames: VoiceCheckF0Point[]) {
  const out: { start_seconds: number; end_seconds: number }[] = [];
  let start: number | null = null;
  let last = 0;
  for (const f of frames) {
    last = f.time_seconds;
    if (f.is_valid) {
      if (start == null) start = f.time_seconds;
    } else if (start != null) {
      if (f.time_seconds - start >= 0.15) {
        out.push({ start_seconds: round3(start), end_seconds: round3(f.time_seconds) });
      }
      start = null;
    }
  }
  if (start != null && last - start >= 0.15) {
    out.push({ start_seconds: round3(start), end_seconds: round3(last) });
  }
  return out.slice(0, 40);
}

function stableVariationCents(
  valid: { frequency_hz: number | null }[],
  window = 9,
): number | null {
  if (valid.length < window) return null;
  const half = Math.floor(window / 2);
  const vars: number[] = [];
  for (let i = half; i < valid.length - half; i++) {
    const chunk = valid
      .slice(i - half, i + half + 1)
      .map((v) => v.frequency_hz)
      .filter((h): h is number => h != null && h > 0);
    if (chunk.length < window - 2) continue;
    const med = median(chunk)!;
    const cents = chunk.map((h) => Math.abs(1200 * Math.log2(h / med)));
    vars.push(Math.max(...cents));
  }
  if (!vars.length) return null;
  return round2(median(vars)!);
}

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
