/**
 * Efeitos na voz (delay, reverb, auto-tune).
 * Preferir o mesmo AudioContext do AudioEngine — dois contexts = base muda após o mic.
 */

export type VoiceFxParams = {
  reverb: number;
  delay: number;
  delayTimeMs: number;
  autotune: number;
};

const DEFAULTS: VoiceFxParams = {
  reverb: 0.2,
  delay: 0.1,
  delayTimeMs: 280,
  autotune: 0,
};

const AUTOTUNE_WORKLET = `
class AutotuneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(8192);
    this.w = 0;
    this.r = 0;
    this.strength = 0;
    this.port.onmessage = (e) => {
      if (typeof e.data?.strength === 'number') this.strength = Math.max(0, Math.min(1, e.data.strength));
    };
  }
  detect(frame) {
    const n = frame.length;
    let e = 0;
    for (let i = 0; i < n; i++) e += frame[i] * frame[i];
    if (e / n < 1e-5) return 0;
    const minL = Math.floor(sampleRate / 800);
    const maxL = Math.min(Math.floor(sampleRate / 70), Math.floor(n / 2));
    let best = -1, bestL = 0;
    for (let lag = minL; lag <= maxL; lag++) {
      let c = 0;
      for (let i = 0; i < n - lag; i++) c += frame[i] * frame[i + lag];
      if (c > best) { best = c; bestL = lag; }
    }
    return bestL > 0 ? sampleRate / bestL : 0;
  }
  nearestMidiHz(hz) {
    if (hz < 50 || hz > 1200) return hz;
    const midi = Math.round(69 + 12 * Math.log2(hz / 440));
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;
    const s = this.strength;
    if (s < 0.01) { output.set(input); return true; }
    for (let i = 0; i < input.length; i++) {
      this.buf[this.w] = input[i];
      this.w = (this.w + 1) % this.buf.length;
    }
    const hz = this.detect(input);
    let ratio = 1;
    if (hz > 60) {
      const raw = this.nearestMidiHz(hz) / hz;
      ratio = Math.max(0.92, Math.min(1.08, 1 + (raw - 1) * s));
    }
    for (let i = 0; i < output.length; i++) {
      const idx = Math.floor(this.r) % this.buf.length;
      const frac = this.r - Math.floor(this.r);
      const a = this.buf[idx];
      const b = this.buf[(idx + 1) % this.buf.length];
      output[i] = a + (b - a) * frac;
      this.r += ratio;
      if (this.r >= this.buf.length) this.r -= this.buf.length;
    }
    return true;
  }
}
registerProcessor('autotune-processor', AutotuneProcessor);
`;

function makeImpulse(ctx: AudioContext, seconds = 1.6): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-3.2 * t) * (1 - i / len);
    }
  }
  return buf;
}

export class LiveVoiceFx {
  private ctx: AudioContext | null = null;
  private ownsContext = true;
  private input: AudioNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;
  private dry: GainNode | null = null;
  private master: GainNode | null = null;
  private autotuneNode: AudioWorkletNode | null = null;
  private preFx: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private params: VoiceFxParams = { ...DEFAULTS };
  private workletReady = false;
  private workletLoadedFor: AudioContext | null = null;

  private async boot(shared?: AudioContext): Promise<AudioContext> {
    this.teardownNodes();
    if (shared) {
      this.ctx = shared;
      this.ownsContext = false;
      if (shared.state === "suspended") await shared.resume();
    } else {
      this.ctx = new AudioContext();
      this.ownsContext = true;
      if (this.ctx.state === "suspended") await this.ctx.resume();
    }
    const ctx = this.ctx;

    if (this.workletLoadedFor !== ctx) {
      try {
        const blob = new Blob([AUTOTUNE_WORKLET], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        this.workletReady = true;
        this.workletLoadedFor = ctx;
      } catch {
        this.workletReady = false;
      }
    }

    this.preFx = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.65;
    this.dry = ctx.createGain();
    this.delay = ctx.createDelay(1.5);
    this.delayFeedback = ctx.createGain();
    this.delayWet = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = makeImpulse(ctx);
    this.reverbWet = ctx.createGain();
    this.master = ctx.createGain();
    this.master.gain.value = 0.95;

    this.preFx.connect(this.analyser);

    if (this.workletReady) {
      this.autotuneNode = new AudioWorkletNode(ctx, "autotune-processor");
      this.preFx.connect(this.autotuneNode);
      this.autotuneNode.connect(this.dry);
      this.autotuneNode.connect(this.delay);
      this.autotuneNode.connect(this.convolver);
    } else {
      this.preFx.connect(this.dry);
      this.preFx.connect(this.delay);
      this.preFx.connect(this.convolver);
    }

    this.delay.connect(this.delayWet);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.convolver.connect(this.reverbWet);
    this.dry.connect(this.master);
    this.delayWet.connect(this.master);
    this.reverbWet.connect(this.master);
    this.master.connect(ctx.destination);

    this.applyParams(this.params);
    return ctx;
  }

  /** Monitor do mic no mesmo context do player (shared). */
  async attachMic(mic: MediaStream, shared?: AudioContext): Promise<void> {
    const ctx = await this.boot(shared);
    const src = ctx.createMediaStreamSource(mic);
    this.input = src;
    src.connect(this.preFx!);
  }

  /** Ouvir ensaio com FX no mesmo context do player. */
  async attachElement(el: HTMLAudioElement, shared?: AudioContext): Promise<void> {
    const ctx = await this.boot(shared);
    const src = ctx.createMediaElementSource(el);
    this.input = src;
    src.connect(this.preFx!);
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  setParams(partial: Partial<VoiceFxParams>) {
    this.params = { ...this.params, ...partial };
    this.applyParams(this.params);
  }

  getParams(): VoiceFxParams {
    return { ...this.params };
  }

  private applyParams(p: VoiceFxParams) {
    if (!this.delay || !this.delayWet || !this.delayFeedback || !this.reverbWet || !this.dry) return;
    this.delay.delayTime.value = Math.max(0.05, Math.min(1.2, p.delayTimeMs / 1000));
    this.delayWet.gain.value = p.delay * 0.55;
    this.delayFeedback.gain.value = p.delay * 0.35;
    this.reverbWet.gain.value = p.reverb * 0.7;
    const wet = Math.max(p.reverb, p.delay);
    this.dry.gain.value = Math.max(0.2, 1 - wet * 0.45);
    this.autotuneNode?.port.postMessage({ strength: p.autotune });
  }

  async resume() {
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  private teardownNodes() {
    try {
      this.input?.disconnect();
      this.autotuneNode?.disconnect();
      this.preFx?.disconnect();
      this.analyser?.disconnect();
      this.dry?.disconnect();
      this.delay?.disconnect();
      this.delayFeedback?.disconnect();
      this.delayWet?.disconnect();
      this.convolver?.disconnect();
      this.reverbWet?.disconnect();
      this.master?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.ownsContext) {
      void this.ctx?.close().catch(() => undefined);
      this.workletLoadedFor = null;
    }
    this.ctx = null;
    this.input = null;
    this.autotuneNode = null;
    this.analyser = null;
    this.preFx = null;
  }

  stop() {
    this.teardownNodes();
  }
}
