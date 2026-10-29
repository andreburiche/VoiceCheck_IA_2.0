/**
 * Mixagem da voz no VoiceCheck: equalização + efeitos (compressor, saturação,
 * chorus, delay, reverb). A mesma cadeia serve para ouvir ao vivo e para
 * exportar o WAV (OfflineAudioContext) — o que você ouve é o que baixa.
 */

import { audioBufferToWav } from "@/lib/vocal-dsp";

export type MixEqBand = { id: string; label: string; type: BiquadFilterType; frequency: number; gainDb: number; q: number };

export type VoiceMixState = {
  enabled: boolean;
  /** Corta graves abaixo disto (Hz); 0 = desligado */
  highpassHz: number;
  eq: MixEqBand[];
  compressor: { enabled: boolean; amount: number }; // 0..1
  saturation: { enabled: boolean; drive: number }; // 0..1
  chorus: { enabled: boolean; depth: number; rateHz: number; mix: number };
  delay: { enabled: boolean; timeMs: number; feedback: number; mix: number; pingPong: boolean };
  reverb: { enabled: boolean; sizeSec: number; decay: number; preDelayMs: number; mix: number; tone: number };
  /** Abre o som em estéreo (0 = mono) */
  width: number;
  outputDb: number;
};

export const MIX_EQ_BANDS: MixEqBand[] = [
  { id: "low", label: "Graves", type: "lowshelf", frequency: 120, gainDb: 0, q: 0.7 },
  { id: "body", label: "Corpo", type: "peaking", frequency: 300, gainDb: 0, q: 1 },
  { id: "mid", label: "Médios", type: "peaking", frequency: 1200, gainDb: 0, q: 1 },
  { id: "presence", label: "Presença", type: "peaking", frequency: 3500, gainDb: 0, q: 1 },
  { id: "air", label: "Brilho", type: "highshelf", frequency: 10000, gainDb: 0, q: 0.7 },
];

export function defaultVoiceMix(): VoiceMixState {
  return {
    enabled: true,
    highpassHz: 80,
    eq: MIX_EQ_BANDS.map((b) => ({ ...b })),
    compressor: { enabled: true, amount: 0.4 },
    saturation: { enabled: false, drive: 0.2 },
    chorus: { enabled: false, depth: 0.3, rateHz: 0.8, mix: 0.25 },
    delay: { enabled: false, timeMs: 320, feedback: 0.3, mix: 0.18, pingPong: true },
    reverb: { enabled: true, sizeSec: 1.8, decay: 0.55, preDelayMs: 20, mix: 0.18, tone: 0.6 },
    width: 0.3,
    outputDb: 0,
  };
}

type Patch = {
  eq?: Partial<Record<string, number>>;
} & Partial<Omit<VoiceMixState, "eq">>;

function withEq(base: VoiceMixState, gains: Partial<Record<string, number>>): MixEqBand[] {
  return base.eq.map((b) => ({ ...b, gainDb: gains[b.id] ?? b.gainDb }));
}

function preset(p: Patch): VoiceMixState {
  const base = defaultVoiceMix();
  const { eq, ...rest } = p;
  return {
    ...base,
    ...rest,
    eq: eq ? withEq(base, eq) : base.eq,
    compressor: { ...base.compressor, ...(rest.compressor ?? {}) },
    saturation: { ...base.saturation, ...(rest.saturation ?? {}) },
    chorus: { ...base.chorus, ...(rest.chorus ?? {}) },
    delay: { ...base.delay, ...(rest.delay ?? {}) },
    reverb: { ...base.reverb, ...(rest.reverb ?? {}) },
  };
}

export const VOICE_MIX_PRESETS: { id: string; label: string; hint: string; state: VoiceMixState }[] = [
  {
    id: "natural",
    label: "Natural",
    hint: "Leve brilho e uma sala pequena.",
    state: preset({ eq: { body: -1, presence: 1.5, air: 1.5 } }),
  },
  {
    id: "pop",
    label: "Pop",
    hint: "Voz na frente, brilhante, com delay discreto.",
    state: preset({
      eq: { low: -2, body: -2, presence: 3, air: 3 },
      compressor: { enabled: true, amount: 0.7 },
      delay: { enabled: true, timeMs: 375, feedback: 0.25, mix: 0.14, pingPong: true },
      reverb: { enabled: true, sizeSec: 1.4, decay: 0.5, preDelayMs: 30, mix: 0.16, tone: 0.7 },
      width: 0.4,
    }),
  },
  {
    id: "balada",
    label: "Balada",
    hint: "Quente, reverb longo e eco suave.",
    state: preset({
      eq: { low: 1, body: 1, presence: 1, air: 2 },
      compressor: { enabled: true, amount: 0.5 },
      delay: { enabled: true, timeMs: 480, feedback: 0.35, mix: 0.16, pingPong: true },
      reverb: { enabled: true, sizeSec: 3.2, decay: 0.7, preDelayMs: 40, mix: 0.28, tone: 0.55 },
      width: 0.5,
    }),
  },
  {
    id: "igreja",
    label: "Igreja / coral",
    hint: "Ambiente grande, como um templo.",
    state: preset({
      eq: { body: -1, presence: 1, air: 2 },
      reverb: { enabled: true, sizeSec: 4.5, decay: 0.85, preDelayMs: 60, mix: 0.38, tone: 0.45 },
      width: 0.6,
    }),
  },
  {
    id: "eco",
    label: "Eco",
    hint: "Delay marcado (estilo anos 50 / rockabilly).",
    state: preset({
      eq: { presence: 2 },
      delay: { enabled: true, timeMs: 140, feedback: 0.45, mix: 0.3, pingPong: false },
      reverb: { enabled: true, sizeSec: 1, decay: 0.4, preDelayMs: 10, mix: 0.1, tone: 0.6 },
    }),
  },
  {
    id: "radio",
    label: "Rádio",
    hint: "Som de rádio antigo / telefone.",
    state: preset({
      highpassHz: 400,
      eq: { low: -12, body: -3, mid: 6, presence: 3, air: -12 },
      compressor: { enabled: true, amount: 0.9 },
      saturation: { enabled: true, drive: 0.5 },
      reverb: { enabled: false, sizeSec: 1, decay: 0.4, preDelayMs: 0, mix: 0, tone: 0.5 },
      width: 0,
    }),
  },
  {
    id: "seco",
    label: "Seco",
    hint: "Sem efeitos: só limpeza e compressão.",
    state: preset({
      reverb: { enabled: false, sizeSec: 1.8, decay: 0.55, preDelayMs: 20, mix: 0, tone: 0.6 },
      width: 0,
    }),
  },
];

function clamp(n: unknown, lo: number, hi: number, d: number): number {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d;
}

export function normalizeVoiceMix(raw: unknown): VoiceMixState {
  const b = defaultVoiceMix();
  if (!raw || typeof raw !== "object") return b;
  const o = raw as Partial<VoiceMixState>;
  return {
    enabled: o.enabled !== false,
    highpassHz: clamp(o.highpassHz, 0, 800, b.highpassHz),
    eq: b.eq.map((band) => {
      const src = (o.eq ?? []).find((x) => x?.id === band.id);
      return { ...band, gainDb: clamp(src?.gainDb, -12, 12, 0) };
    }),
    compressor: { enabled: Boolean(o.compressor?.enabled ?? b.compressor.enabled), amount: clamp(o.compressor?.amount, 0, 1, b.compressor.amount) },
    saturation: { enabled: Boolean(o.saturation?.enabled ?? false), drive: clamp(o.saturation?.drive, 0, 1, b.saturation.drive) },
    chorus: {
      enabled: Boolean(o.chorus?.enabled ?? false),
      depth: clamp(o.chorus?.depth, 0, 1, b.chorus.depth),
      rateHz: clamp(o.chorus?.rateHz, 0.1, 5, b.chorus.rateHz),
      mix: clamp(o.chorus?.mix, 0, 1, b.chorus.mix),
    },
    delay: {
      enabled: Boolean(o.delay?.enabled ?? false),
      timeMs: clamp(o.delay?.timeMs, 20, 1200, b.delay.timeMs),
      feedback: clamp(o.delay?.feedback, 0, 0.85, b.delay.feedback),
      mix: clamp(o.delay?.mix, 0, 1, b.delay.mix),
      pingPong: Boolean(o.delay?.pingPong ?? true),
    },
    reverb: {
      enabled: Boolean(o.reverb?.enabled ?? b.reverb.enabled),
      sizeSec: clamp(o.reverb?.sizeSec, 0.3, 6, b.reverb.sizeSec),
      decay: clamp(o.reverb?.decay, 0.2, 0.95, b.reverb.decay),
      preDelayMs: clamp(o.reverb?.preDelayMs, 0, 200, b.reverb.preDelayMs),
      mix: clamp(o.reverb?.mix, 0, 1, b.reverb.mix),
      tone: clamp(o.reverb?.tone, 0, 1, b.reverb.tone),
    },
    width: clamp(o.width, 0, 1, b.width),
    outputDb: clamp(o.outputDb, -12, 12, 0),
  };
}

/** PRNG determinístico: o reverb exportado soa igual ao da prévia. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function impulse(ctx: BaseAudioContext, sizeSec: number, decay: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * sizeSec));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const rnd = mulberry32(1234 + c * 77);
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 1.5 + decay * 5);
    }
  }
  return buf;
}

function saturationCurve(drive: number): Float32Array {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = 1 + drive * 30;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

const db = (v: number) => Math.pow(10, v / 20);

export type VoiceMixChain = {
  input: AudioNode;
  output: AudioNode;
  update: (s: VoiceMixState) => void;
  dispose: () => void;
};

/** Monta a cadeia. `input` recebe a voz (mono ou estéreo); `output` sai estéreo. */
export function buildVoiceMixChain(ctx: BaseAudioContext, initial: VoiceMixState): VoiceMixChain {
  const input = ctx.createGain();
  const bypass = ctx.createGain();
  const fxIn = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  const bands = MIX_EQ_BANDS.map((b) => {
    const f = ctx.createBiquadFilter();
    f.type = b.type;
    f.frequency.value = b.frequency;
    f.Q.value = b.q;
    return f;
  });
  const comp = ctx.createDynamicsCompressor();
  const compMakeup = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.oversample = "2x";
  const dry = ctx.createGain();
  const bus = ctx.createGain();

  // Chorus: atraso curto modulado
  const chorusDelay = ctx.createDelay(0.1);
  const chorusLfo = ctx.createOscillator();
  const chorusDepth = ctx.createGain();
  const chorusWet = ctx.createGain();
  chorusLfo.connect(chorusDepth).connect(chorusDelay.delayTime);
  chorusLfo.start();

  // Delay (ping-pong opcional)
  const delayL = ctx.createDelay(2.5);
  const delayR = ctx.createDelay(2.5);
  const fbL = ctx.createGain();
  const fbR = ctx.createGain();
  const fbSelf = ctx.createGain();
  const monoToR = ctx.createGain();
  const delayTone = ctx.createBiquadFilter();
  delayTone.type = "lowpass";
  delayTone.frequency.value = 5000;
  const delayWet = ctx.createGain();
  const delayMerge = ctx.createChannelMerger(2);

  // Reverb
  const preDelay = ctx.createDelay(1);
  const convolver = ctx.createConvolver();
  const revTone = ctx.createBiquadFilter();
  revTone.type = "lowpass";
  const revWet = ctx.createGain();

  // Largura estéreo: espalha um pouco da voz com atraso de Haas
  const widthDelay = ctx.createDelay(0.05);
  widthDelay.delayTime.value = 0.012;
  const widthGain = ctx.createGain();
  const widthMerge = ctx.createChannelMerger(2);
  const center = ctx.createGain();

  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  const output = ctx.createGain();

  // Ligações fixas
  input.connect(bypass);
  input.connect(fxIn);
  let node: AudioNode = fxIn;
  node.connect(hp);
  node = hp;
  for (const f of bands) {
    node.connect(f);
    node = f;
  }
  node.connect(comp).connect(compMakeup).connect(shaper).connect(bus);
  bus.connect(dry).connect(center).connect(master);
  bus.connect(chorusDelay).connect(chorusWet).connect(master);
  bus.connect(widthDelay).connect(widthGain);
  widthGain.connect(widthMerge, 0, 1);
  widthMerge.connect(master);
  // delay ping-pong: L → R → L
  bus.connect(delayTone).connect(delayL);
  delayL.connect(fbL).connect(delayR);
  delayR.connect(fbR).connect(delayL);
  delayL.connect(fbSelf).connect(delayL); // eco simples (sem ping-pong)
  delayL.connect(delayMerge, 0, 0);
  delayL.connect(monoToR).connect(delayMerge, 0, 1);
  delayR.connect(delayMerge, 0, 1);
  delayMerge.connect(delayWet).connect(master);
  bus.connect(preDelay).connect(convolver).connect(revTone).connect(revWet).connect(master);
  master.connect(limiter).connect(output);

  let lastIr = "";
  const t = () => ctx.currentTime;
  let immediate = true; // 1ª aplicação (e exportação) sem rampa
  const set = (p: AudioParam, v: number) => {
    if (immediate) {
      p.value = v;
      return;
    }
    try {
      p.setTargetAtTime(v, t(), 0.02);
    } catch {
      p.value = v;
    }
  };

  function update(s: VoiceMixState) {
    const on = s.enabled;
    set(bypass.gain, on ? 0 : 1);
    set(fxIn.gain, on ? 1 : 0);
    hp.frequency.value = s.highpassHz > 0 ? s.highpassHz : 10;
    s.eq.forEach((b, i) => {
      const f = bands[i];
      if (f) set(f.gain, b.gainDb);
    });
    const a = s.compressor.enabled ? s.compressor.amount : 0;
    comp.threshold.value = -6 - a * 24;
    comp.ratio.value = 1 + a * 5;
    comp.knee.value = 12;
    comp.attack.value = 0.008;
    comp.release.value = 0.18;
    set(compMakeup.gain, db(a * 7));
    shaper.curve = s.saturation.enabled && s.saturation.drive > 0 ? (saturationCurve(s.saturation.drive) as Float32Array<ArrayBuffer>) : null;

    set(chorusWet.gain, s.chorus.enabled ? s.chorus.mix : 0);
    chorusDelay.delayTime.value = 0.018;
    chorusLfo.frequency.value = s.chorus.rateHz;
    set(chorusDepth.gain, 0.006 * s.chorus.depth);

    const dt = s.delay.timeMs / 1000;
    const pp = s.delay.pingPong;
    delayL.delayTime.value = dt;
    delayR.delayTime.value = dt;
    set(fbL.gain, pp ? s.delay.feedback : 0);
    set(fbR.gain, pp ? s.delay.feedback : 0);
    set(fbSelf.gain, pp ? 0 : s.delay.feedback);
    set(monoToR.gain, pp ? 0 : 1);
    set(delayWet.gain, s.delay.enabled ? s.delay.mix : 0);

    const ir = `${s.reverb.sizeSec.toFixed(2)}:${s.reverb.decay.toFixed(2)}`;
    if (ir !== lastIr) {
      convolver.buffer = impulse(ctx, s.reverb.sizeSec, s.reverb.decay);
      lastIr = ir;
    }
    preDelay.delayTime.value = s.reverb.preDelayMs / 1000;
    revTone.frequency.value = 2500 + s.reverb.tone * 9000;
    set(revWet.gain, s.reverb.enabled ? s.reverb.mix * 1.4 : 0);

    set(widthGain.gain, s.width * 0.5);
    set(center.gain, 1 - s.width * 0.15);
    set(dry.gain, 1);
    set(master.gain, db(s.outputDb));
  }

  // bypass também passa pelo limitador (nível igual para comparar)
  bypass.connect(output);
  update(initial);
  immediate = false;

  return {
    input,
    output,
    update,
    dispose: () => {
      try {
        chorusLfo.stop();
      } catch {
        /* já parado */
      }
      input.disconnect();
      output.disconnect();
    },
  };
}

/** Renderiza a voz com a mixagem e devolve um WAV estéreo 16-bit. */
export async function renderVoiceMix(
  source: Blob,
  state: VoiceMixState,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const decodeCtx = new AudioContext();
  let buf: AudioBuffer;
  try {
    buf = await decodeCtx.decodeAudioData(await source.arrayBuffer());
  } finally {
    void decodeCtx.close();
  }
  // Rabo do reverb/delay no fim
  const tail = state.enabled ? Math.min(6, Math.max(state.reverb.enabled ? state.reverb.sizeSec : 0, state.delay.enabled ? 2 : 0)) : 0;
  const length = Math.ceil((buf.duration + tail) * buf.sampleRate);
  const off = new OfflineAudioContext(2, length, buf.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buf;
  const chain = buildVoiceMixChain(off, { ...state });
  src.connect(chain.input);
  chain.output.connect(off.destination);
  src.start();
  onProgress?.(10);
  const rendered = await off.startRendering();
  onProgress?.(95);
  return audioBufferToWav(rendered);
}
