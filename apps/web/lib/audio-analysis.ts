/**
 * Estimativas de BPM, tonalidade e acordes no browser (autocorrelação + chroma).
 * Resultados são aproximações editáveis — nunca verdade absoluta.
 */

export type AnalysisEstimate = {
  bpm: number;
  musical_key: string;
  confidence_bpm: number;
  confidence_key: number;
  /** Progressão resumida (ex.: "Am F C G") — estimativa. */
  chords: string;
  /** Duração do áudio analisado (s). */
  duration_sec: number;
  /**
   * Grade de batidas estimada a partir do BPM (não onset detection real).
   * Útil para visualização didática — marcar como estimativa na UI.
   */
  beat_times_sec: number[];
};

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Perfis Krumhansl-Schmuckler (major / minor). */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Mistura stems (ou um buffer) em mono normalizado para análise. */
export function mixToMono(buffers: AudioBuffer[]): Float32Array {
  if (!buffers.length) return new Float32Array(0);
  const len = Math.min(...buffers.map((b) => b.length));
  const sr = buffers[0]!.sampleRate;
  const out = new Float32Array(len);
  for (const buf of buffers) {
    const chans = buf.numberOfChannels;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < chans; c++) s += buf.getChannelData(c)[i]!;
      out[i]! += s / chans;
    }
  }
  let peak = 1e-9;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]!));
  for (let i = 0; i < len; i++) out[i]! /= peak;
  // Descarta metadado sr não usado além de limiar de duração
  void sr;
  return out;
}

export function analyzeAudioBuffers(buffers: AudioBuffer[]): AnalysisEstimate | null {
  if (!buffers.length) return null;
  const mono = mixToMono(buffers);
  if (mono.length < 2048) return null;
  const sr = buffers[0]!.sampleRate;

  // Analisa até ~45s do meio (mais estável que intro/outro)
  const maxSamples = Math.min(mono.length, Math.floor(sr * 45));
  const start = Math.max(0, Math.floor((mono.length - maxSamples) / 2));
  const slice = mono.subarray(start, start + maxSamples);

  const bpmResult = estimateBpm(slice, sr);
  const keyResult = estimateKey(slice, sr);
  const chords = estimateChordProgression(slice, sr, bpmResult.bpm);
  const duration_sec = mono.length / sr;

  return {
    bpm: bpmResult.bpm,
    musical_key: keyResult.key,
    confidence_bpm: bpmResult.confidence,
    confidence_key: keyResult.confidence,
    chords,
    duration_sec,
    beat_times_sec: buildBeatGrid(duration_sec, bpmResult.bpm),
  };
}

/** Grade uniforme de batidas a partir do BPM — estimativa, não detecção de onset. */
export function buildBeatGrid(durationSec: number, bpm: number, maxBeats = 512): number[] {
  if (!durationSec || !bpm || bpm < 20) return [];
  const interval = 60 / bpm;
  const beats: number[] = [];
  for (let t = 0; t < durationSec && beats.length < maxBeats; t += interval) {
    beats.push(Number(t.toFixed(3)));
  }
  return beats;
}

/** Tríades maiores/menores — template binário nas pitch classes. */
const TRIAD_TEMPLATES: { suffix: string; intervals: number[] }[] = [
  { suffix: "", intervals: [0, 4, 7] },
  { suffix: "m", intervals: [0, 3, 7] },
  { suffix: "7", intervals: [0, 4, 7, 10] },
  { suffix: "m7", intervals: [0, 3, 7, 10] },
];

/**
 * Janelas ~1 compasso → acorde dominante; colapsa repetidos consecutivos.
 */
export function estimateChordProgression(
  samples: Float32Array,
  sampleRate: number,
  bpm: number,
  maxChords = 12,
): string {
  const beatSec = 60 / Math.max(40, bpm);
  const barSec = beatSec * 4;
  const targetSr = 11025;
  const step = Math.max(1, Math.round(sampleRate / targetSr));
  const sr = sampleRate / step;
  const n = Math.min(Math.floor(samples.length / step), Math.floor(sr * 45));
  if (n < 4096) return "";

  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = samples[i * step]!;

  const freqs: { pc: number; f: number }[] = [];
  for (let midi = 36; midi <= 84; midi++) {
    freqs.push({ pc: ((midi % 12) + 12) % 12, f: 440 * Math.pow(2, (midi - 69) / 12) });
  }

  const barSamples = Math.max(2048, Math.floor(barSec * sr));
  const sequence: string[] = [];
  for (let start = 0; start + barSamples < n && sequence.length < maxChords * 2; start += barSamples) {
    const chroma = new Float32Array(12);
    const frame = 2048;
    const hop = 1024;
    for (let i = start; i + frame < start + barSamples; i += hop) {
      for (const { pc, f } of freqs) {
        if (f >= sr / 2) continue;
        chroma[pc]! += goertzelPower(mono, i, frame, f, sr);
      }
    }
    let sum = 0;
    for (let c = 0; c < 12; c++) sum += chroma[c]!;
    if (sum < 1e-12) continue;
    for (let c = 0; c < 12; c++) chroma[c]! /= sum;

    let best = "C";
    let bestScore = -Infinity;
    for (let root = 0; root < 12; root++) {
      for (const tpl of TRIAD_TEMPLATES) {
        let score = 0;
        for (const iv of tpl.intervals) {
          score += chroma[(root + iv) % 12]!;
        }
        score /= tpl.intervals.length;
        if (score > bestScore) {
          bestScore = score;
          best = `${PITCH_CLASSES[root]}${tpl.suffix}`;
        }
      }
    }
    if (sequence.length === 0 || sequence[sequence.length - 1] !== best) {
      sequence.push(best);
    }
  }

  return sequence.slice(0, maxChords).join(" ");
}

function estimateBpm(samples: Float32Array, sampleRate: number): { bpm: number; confidence: number } {
  // Envelope via |diff| + downsample ~250 Hz
  const hop = Math.max(1, Math.floor(sampleRate / 250));
  const envLen = Math.floor(samples.length / hop);
  const env = new Float32Array(envLen);
  for (let i = 0; i < envLen; i++) {
    let sum = 0;
    const base = i * hop;
    for (let j = 0; j < hop && base + j + 1 < samples.length; j++) {
      sum += Math.abs(samples[base + j + 1]! - samples[base + j]!);
    }
    env[i] = sum;
  }

  const envSr = sampleRate / hop;
  const minBpm = 60;
  const maxBpm = 180;
  const minLag = Math.floor((60 / maxBpm) * envSr);
  const maxLag = Math.floor((60 / minBpm) * envSr);

  let bestLag = minLag;
  let bestCorr = -Infinity;
  let second = -Infinity;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    let n = 0;
    for (let i = 0; i + lag < envLen; i++) {
      corr += env[i]! * env[i + lag]!;
      n++;
    }
    if (n > 0) corr /= n;
    if (corr > bestCorr) {
      second = bestCorr;
      bestCorr = corr;
      bestLag = lag;
    } else if (corr > second) {
      second = corr;
    }
  }

  let bpm = 60 / (bestLag / envSr);
  // Preferir faixa comum de música pop (80–160): dobrar/metade se necessário
  while (bpm < 80) bpm *= 2;
  while (bpm > 160) bpm /= 2;
  bpm = Math.round(bpm);

  const confidence =
    bestCorr > 0 && second > 0 ? Math.min(1, Math.max(0.15, 1 - second / bestCorr)) : 0.3;

  return { bpm: clamp(bpm, 40, 240), confidence };
}

function estimateKey(samples: Float32Array, sampleRate: number): { key: string; confidence: number } {
  // Downsample ~11025 Hz + Goertzel nas 12 classes (octavas 2–5) — leve o bastante p/ UI
  const targetSr = 11025;
  const step = Math.max(1, Math.round(sampleRate / targetSr));
  const sr = sampleRate / step;
  const n = Math.min(Math.floor(samples.length / step), Math.floor(sr * 20));
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = samples[i * step]!;

  const chroma = new Float32Array(12);
  const frame = 2048;
  const hop = 1024;
  // Frequências MIDI 36..84 (C2–C6)
  const freqs: { pc: number; f: number }[] = [];
  for (let midi = 36; midi <= 84; midi++) {
    freqs.push({ pc: ((midi % 12) + 12) % 12, f: 440 * Math.pow(2, (midi - 69) / 12) });
  }

  for (let i = 0; i + frame < n; i += hop) {
    for (const { pc, f } of freqs) {
      if (f >= sr / 2) continue;
      const mag = goertzelPower(mono, i, frame, f, sr);
      chroma[pc]! += mag;
    }
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chroma[i]!;
  if (sum < 1e-12) return { key: "C", confidence: 0 };
  for (let i = 0; i < 12; i++) chroma[i]! /= sum;

  let bestKey = "C";
  let bestScore = -Infinity;
  let second = -Infinity;

  for (let root = 0; root < 12; root++) {
    for (const [profile, suffix] of [
      [MAJOR_PROFILE, ""] as const,
      [MINOR_PROFILE, "m"] as const,
    ]) {
      let score = 0;
      for (let i = 0; i < 12; i++) {
        score += chroma[i]! * profile[(i - root + 12) % 12]!;
      }
      if (score > bestScore) {
        second = bestScore;
        bestScore = score;
        bestKey = `${PITCH_CLASSES[root]}${suffix}`;
      } else if (score > second) {
        second = score;
      }
    }
  }

  const confidence =
    bestScore > 0 && second > 0 ? Math.min(1, Math.max(0.1, 1 - second / bestScore)) : 0.25;

  return { key: bestKey, confidence };
}

/** Potência Goertzel em um frame (sem alocar). */
function goertzelPower(
  samples: Float32Array,
  offset: number,
  frame: number,
  freq: number,
  sampleRate: number,
): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  const end = Math.min(offset + frame, samples.length);
  for (let i = offset; i < end; i++) {
    s0 = samples[i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const re = s1 - s2 * Math.cos(w);
  const im = s2 * Math.sin(w);
  return re * re + im * im;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
