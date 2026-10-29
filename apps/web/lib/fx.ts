/** Efeitos de master bus (reverb / delay / compressor) — estado serializável. */

export type FxState = {
  enabled: boolean;
  compressor: {
    enabled: boolean;
    threshold: number; // dB -60..0
    ratio: number; // 1..20
    attack: number; // sec
    release: number;
  };
  delay: {
    enabled: boolean;
    timeSec: number; // 0..1
    feedback: number; // 0..0.85
    mix: number; // 0..1 wet
  };
  reverb: {
    enabled: boolean;
    mix: number; // 0..1 wet
    decay: number; // 0.2..0.95 (impulse shape)
  };
};

export function defaultFxState(): FxState {
  return {
    enabled: true,
    compressor: {
      enabled: false,
      threshold: -24,
      ratio: 3,
      attack: 0.01,
      release: 0.25,
    },
    delay: {
      enabled: false,
      timeSec: 0.28,
      feedback: 0.25,
      mix: 0.2,
    },
    reverb: {
      enabled: false,
      mix: 0.18,
      decay: 0.55,
    },
  };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function normalizeFxState(raw: unknown): FxState {
  const base = defaultFxState();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Partial<FxState>;
  return {
    enabled: o.enabled !== false,
    compressor: {
      ...base.compressor,
      ...(o.compressor ?? {}),
      threshold: clamp(Number(o.compressor?.threshold ?? base.compressor.threshold), -60, 0),
      ratio: clamp(Number(o.compressor?.ratio ?? base.compressor.ratio), 1, 20),
      attack: clamp(Number(o.compressor?.attack ?? base.compressor.attack), 0.001, 1),
      release: clamp(Number(o.compressor?.release ?? base.compressor.release), 0.01, 2),
      enabled: Boolean(o.compressor?.enabled ?? false),
    },
    delay: {
      ...base.delay,
      ...(o.delay ?? {}),
      timeSec: clamp(Number(o.delay?.timeSec ?? base.delay.timeSec), 0.01, 1),
      feedback: clamp(Number(o.delay?.feedback ?? base.delay.feedback), 0, 0.85),
      mix: clamp(Number(o.delay?.mix ?? base.delay.mix), 0, 1),
      enabled: Boolean(o.delay?.enabled ?? false),
    },
    reverb: {
      ...base.reverb,
      ...(o.reverb ?? {}),
      mix: clamp(Number(o.reverb?.mix ?? base.reverb.mix), 0, 1),
      decay: clamp(Number(o.reverb?.decay ?? base.reverb.decay), 0.2, 0.95),
      enabled: Boolean(o.reverb?.enabled ?? false),
    },
  };
}

/** Impulse sintético para ConvolverNode (sem arquivo externo). */
export function buildReverbImpulse(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number,
): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const d = clamp(decay, 0.2, 0.95);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2 + d * 4);
    }
  }
  return buf;
}
