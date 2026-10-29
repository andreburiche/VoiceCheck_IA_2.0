/**
 * Time-stretch e pitch-shift no client (WSOLA + resample).
 * Licença: código próprio do projeto (sem deps GPL/LGPL).
 * Qualidade adequada a treino 50–150%; não é mastering.
 */

export type StretchQuality = "fast" | "default";

type StretchOpts = {
  quality?: StretchQuality;
  /** Chamado periodicamente para não travar a UI (ex.: await yield). */
  onProgress?: () => void | Promise<void>;
};

function yieldEvery(hops: number, every: number, onProgress?: () => void | Promise<void>) {
  if (!onProgress || hops % every !== 0) return Promise.resolve();
  return Promise.resolve(onProgress());
}

/** Stretch de tempo preservando pitch. rate>1 = mais rápido (buffer mais curto). */
export function timeStretchBuffer(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  rate: number,
  opts?: StretchOpts,
): AudioBuffer {
  const r = clamp(rate, 0.5, 2);
  if (Math.abs(r - 1) < 0.001) return cloneBuffer(ctx, input);

  const channels = input.numberOfChannels;
  const inLen = input.length;
  const outLen = Math.max(1, Math.round(inLen / r));
  const out = ctx.createBuffer(channels, outLen, input.sampleRate);

  const winSize = Math.min(inLen, Math.max(256, Math.round(input.sampleRate * 0.03)));
  const hopOut = Math.max(64, Math.floor(winSize / 2));
  const hopIn = hopOut * r;
  const window = hann(winSize);
  const search =
    opts?.quality === "fast" ? 0 : Math.floor(winSize / 4);

  for (let ch = 0; ch < channels; ch++) {
    const src = input.getChannelData(ch);
    const dst = out.getChannelData(ch);
    const weight = new Float32Array(outLen);

    let inPos = 0;
    let outPos = 0;
    while (outPos + winSize < outLen && inPos + winSize < inLen) {
      const i0 = Math.floor(inPos);
      let best = i0;
      if (outPos > 0 && search > 0) {
        let bestCorr = -Infinity;
        const prevStart = Math.max(0, outPos - hopOut);
        for (let s = -search; s <= search; s++) {
          const cand = i0 + s;
          if (cand < 0 || cand + winSize >= inLen) continue;
          let corr = 0;
          const lim = Math.min(hopOut, winSize);
          for (let n = 0; n < lim; n++) {
            corr += src[cand + n]! * dst[prevStart + n]!;
          }
          if (corr > bestCorr) {
            bestCorr = corr;
            best = cand;
          }
        }
      }

      for (let n = 0; n < winSize; n++) {
        const o = outPos + n;
        if (o >= outLen || best + n >= inLen) break;
        const w = window[n]!;
        dst[o]! += src[best + n]! * w;
        weight[o]! += w;
      }
      inPos += hopIn;
      outPos += hopOut;
    }

    for (let i = 0; i < outLen; i++) {
      const w = weight[i]!;
      if (w > 1e-6) dst[i]! /= w;
    }
  }

  return out;
}

/** Versão async — cede a UI entre janelas (evita “página sem resposta”). */
export async function timeStretchBufferAsync(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  rate: number,
  opts?: StretchOpts,
): Promise<AudioBuffer> {
  const r = clamp(rate, 0.5, 2);
  if (Math.abs(r - 1) < 0.001) return cloneBuffer(ctx, input);

  const channels = input.numberOfChannels;
  const inLen = input.length;
  const outLen = Math.max(1, Math.round(inLen / r));
  const out = ctx.createBuffer(channels, outLen, input.sampleRate);

  const winSize = Math.min(inLen, Math.max(256, Math.round(input.sampleRate * 0.03)));
  const hopOut = Math.max(64, Math.floor(winSize / 2));
  const hopIn = hopOut * r;
  const window = hann(winSize);
  // fast = sem busca de correlação (muito mais leve na UI)
  const search = opts?.quality === "default" ? Math.floor(winSize / 4) : 0;
  const onProgress = opts?.onProgress;

  for (let ch = 0; ch < channels; ch++) {
    const src = input.getChannelData(ch);
    const dst = out.getChannelData(ch);
    const weight = new Float32Array(outLen);

    let inPos = 0;
    let outPos = 0;
    let hops = 0;
    while (outPos + winSize < outLen && inPos + winSize < inLen) {
      const i0 = Math.floor(inPos);
      let best = i0;
      if (outPos > 0 && search > 0) {
        let bestCorr = -Infinity;
        const prevStart = Math.max(0, outPos - hopOut);
        for (let s = -search; s <= search; s++) {
          const cand = i0 + s;
          if (cand < 0 || cand + winSize >= inLen) continue;
          let corr = 0;
          const lim = Math.min(hopOut, winSize);
          for (let n = 0; n < lim; n++) {
            corr += src[cand + n]! * dst[prevStart + n]!;
          }
          if (corr > bestCorr) {
            bestCorr = corr;
            best = cand;
          }
        }
      }

      for (let n = 0; n < winSize; n++) {
        const o = outPos + n;
        if (o >= outLen || best + n >= inLen) break;
        const w = window[n]!;
        dst[o]! += src[best + n]! * w;
        weight[o]! += w;
      }
      inPos += hopIn;
      outPos += hopOut;
      hops += 1;
      await yieldEvery(hops, 24, onProgress);
    }

    for (let i = 0; i < outLen; i++) {
      const w = weight[i]!;
      if (w > 1e-6) dst[i]! /= w;
    }
    await yieldEvery(ch + 1, 1, onProgress);
  }

  return out;
}

export function pitchShiftBuffer(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  semitones: number,
  opts?: StretchOpts,
): AudioBuffer {
  const st = clamp(semitones, -12, 12);
  if (Math.abs(st) < 0.01) return cloneBuffer(ctx, input);
  const ratio = Math.pow(2, st / 12);
  const resampled = resampleBuffer(ctx, input, ratio);
  return timeStretchBuffer(ctx, resampled, 1 / ratio, opts);
}

export async function pitchShiftBufferAsync(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  semitones: number,
  opts?: StretchOpts,
): Promise<AudioBuffer> {
  const st = clamp(semitones, -12, 12);
  if (Math.abs(st) < 0.01) return cloneBuffer(ctx, input);
  const ratio = Math.pow(2, st / 12);
  const resampled = resampleBuffer(ctx, input, ratio);
  return timeStretchBufferAsync(ctx, resampled, 1 / ratio, opts);
}

export function applySpeedAndPitch(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  speedPct: number,
  pitchSemitones: number,
  opts?: StretchOpts,
): AudioBuffer {
  const speed = clamp(speedPct, 50, 150) / 100;
  const quality = opts?.quality ?? "fast";
  let buf = input;
  if (Math.abs(pitchSemitones) >= 0.01) {
    buf = pitchShiftBuffer(ctx, buf, pitchSemitones, { ...opts, quality });
  }
  if (Math.abs(speed - 1) >= 0.001) {
    buf = timeStretchBuffer(ctx, buf, speed, { ...opts, quality });
  }
  return buf;
}

export async function applySpeedAndPitchAsync(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  speedPct: number,
  pitchSemitones: number,
  opts?: StretchOpts,
): Promise<AudioBuffer> {
  const speed = clamp(speedPct, 50, 150) / 100;
  const quality = opts?.quality ?? "fast";
  const onProgress =
    opts?.onProgress ??
    (() => new Promise<void>((r) => setTimeout(r, 0)));

  let buf = input;
  if (Math.abs(pitchSemitones) >= 0.01) {
    buf = await pitchShiftBufferAsync(ctx, buf, pitchSemitones, { quality, onProgress });
  }
  if (Math.abs(speed - 1) >= 0.001) {
    buf = await timeStretchBufferAsync(ctx, buf, speed, { quality, onProgress });
  }
  if (buf === input) return cloneBuffer(ctx, input);
  return buf;
}

function resampleBuffer(ctx: BaseAudioContext, input: AudioBuffer, ratio: number): AudioBuffer {
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = ctx.createBuffer(input.numberOfChannels, outLen, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch++) {
    const src = input.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < outLen; i++) {
      const srcPos = i * ratio;
      const i0 = Math.floor(srcPos);
      const frac = srcPos - i0;
      const a = src[i0] ?? 0;
      const b = src[Math.min(i0 + 1, src.length - 1)] ?? 0;
      dst[i] = a + (b - a) * frac;
    }
  }
  return out;
}

function cloneBuffer(ctx: BaseAudioContext, input: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(input.numberOfChannels, input.length, input.sampleRate);
  for (let ch = 0; ch < input.numberOfChannels; ch++) {
    out.copyToChannel(input.getChannelData(ch), ch);
  }
  return out;
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
