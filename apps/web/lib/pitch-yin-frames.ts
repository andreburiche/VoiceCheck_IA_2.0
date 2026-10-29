/**
 * YIN simplificado (autocorrelação) → frames F0.
 * Mesmo algoritmo do Lab Vocal / midi-export — monofonia experimental.
 */

import { hzToMidi } from "@/lib/pitch-math";

export type PitchFrame = {
  /** Tempo relativo ao início do buffer (s). */
  tSec: number;
  /** F0 em Hz, ou null se não vozeado / baixa confiança. */
  hz: number | null;
  midi: number | null;
  /** Correlação normalizada 0..1 (proxy de confiança do frame). */
  corr: number;
  /** RMS do frame. */
  amp: number;
};

export type PitchFrameOpts = {
  hopSec?: number;
  minHz?: number;
  maxHz?: number;
  /** RMS mínimo para considerar vozeado. */
  minAmp?: number;
  /** Correlação mínima. */
  minCorr?: number;
};

/** Extrai trilha F0 frame a frame (não agrupa em notas). */
export function estimatePitchFrames(
  buffer: AudioBuffer,
  opts?: PitchFrameOpts,
): PitchFrame[] {
  const hopSec = opts?.hopSec ?? 0.05;
  const minHz = opts?.minHz ?? 80;
  const maxHz = opts?.maxHz ?? 1000;
  const minAmp = opts?.minAmp ?? 0.01;
  const minCorr = opts?.minCorr ?? 0.3;
  const sr = buffer.sampleRate;
  const hop = Math.max(1, Math.floor(sr * hopSec));
  const win = Math.max(hop * 2, Math.floor(sr * 0.04));
  const channel = buffer.getChannelData(0);
  const minLag = Math.floor(sr / maxHz);
  const maxLag = Math.floor(sr / minHz);

  const frames: PitchFrame[] = [];

  for (let start = 0; start + win < channel.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < win; i++) {
      const s = channel[start + i] ?? 0;
      energy += s * s;
    }
    const amp = Math.sqrt(energy / win);
    const tSec = start / sr;
    if (amp < minAmp) {
      frames.push({ tSec, hz: null, midi: null, corr: 0, amp });
      continue;
    }

    let bestLag = 0;
    let bestCorr = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let norm = 0;
      for (let i = 0; i < win - lag; i++) {
        const a = channel[start + i] ?? 0;
        const b = channel[start + i + lag] ?? 0;
        corr += a * b;
        norm += a * a;
      }
      const c = norm > 0 ? corr / norm : 0;
      if (c > bestCorr) {
        bestCorr = c;
        bestLag = lag;
      }
    }

    if (bestCorr < minCorr || bestLag <= 0) {
      frames.push({ tSec, hz: null, midi: null, corr: Math.max(0, bestCorr), amp });
      continue;
    }
    const hz = sr / bestLag;
    const midi = hzToMidi(hz);
    if (midi < 36 || midi > 84) {
      frames.push({ tSec, hz: null, midi: null, corr: bestCorr, amp });
      continue;
    }
    frames.push({ tSec, hz, midi, corr: bestCorr, amp });
  }

  return frames;
}
