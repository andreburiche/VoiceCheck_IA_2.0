/**
 * Motor de áudio sample-accurate: um AudioContext, stems agendados no mesmo currentTime.
 * WaveSurfer (UI) não controla o transporte.
 * Velocidade/pitch: WSOLA no client (pitch-preserving) — ver audio-stretch.ts.
 */

import { applySpeedAndPitch, applySpeedAndPitchAsync } from "./audio-stretch";
import { defaultEqState, type EqBand, type EqState } from "./eq";
import { buildReverbImpulse, defaultFxState, type FxState } from "./fx";

export type StemId = string;

export type StemChannelConfig = {
  volume: number; // 0..2
  mute: boolean;
  solo: boolean;
  pan: number; // -1..1
};

export type { EqBand, EqState, FxState };

export type LoopRegion = {
  start: number; // seconds (timeline do conteúdo original)
  end: number;
} | null;

export type EngineEvents = {
  time: (seconds: number) => void;
  ended: () => void;
  state: (playing: boolean) => void;
  loop: () => void;
};

type StemNodes = {
  raw: AudioBuffer;
  buffer: AudioBuffer;
  gain: GainNode;
  pan: StereoPannerNode;
  source: AudioBufferSourceNode | null;
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Entrada do bus pós-pan; alimenta a cadeia de EQ antes do master. */
  private eqInput: GainNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private eqState: EqState = defaultEqState();
  private fxState: FxState = defaultFxState();
  private compressor: DynamicsCompressorNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private lastReverbDecay = -1;
  private metroGain: GainNode | null = null;
  private stems = new Map<StemId, StemNodes>();
  private configs = new Map<StemId, StemChannelConfig>();
  private startedAtCtx = 0;
  private offsetWhenStarted = 0;
  private playing = false;
  private duration = 0;
  private raf = 0;
  private listeners: Partial<EngineEvents> = {};
  private masterGain = 1;
  private loop: LoopRegion = null;
  private metronomeEnabled = false;
  private metronomeBpm = 120;
  private nextClickBeat = 0;
  private scheduledClicks: OscillatorNode[] = [];
  private speedPct = 100;
  private pitchSemitones = 0;
  private rebuildToken = 0;

  on<K extends keyof EngineEvents>(event: K, cb: EngineEvents[K]) {
    this.listeners[event] = cb;
  }

  async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterGain;
      this.eqInput = this.ctx.createGain();
      this.eqFilters = this.eqState.bands.map((band) => {
        const f = this.ctx!.createBiquadFilter();
        this.applyBandToFilter(f, band, this.eqState.enabled);
        return f;
      });
      let node: AudioNode = this.eqInput;
      for (const f of this.eqFilters) {
        node.connect(f);
        node = f;
      }

      // EQ → compressor → fxBus → master (dry) + delay/reverb sends
      this.compressor = this.ctx.createDynamicsCompressor();
      this.fxBus = this.ctx.createGain();
      node.connect(this.compressor);
      this.compressor.connect(this.fxBus);
      this.fxBus.connect(this.master);

      this.delayNode = this.ctx.createDelay(1.0);
      this.delayFeedback = this.ctx.createGain();
      this.delayWet = this.ctx.createGain();
      this.fxBus.connect(this.delayNode);
      this.delayNode.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delayNode);
      this.delayNode.connect(this.delayWet);
      this.delayWet.connect(this.master);

      this.reverbConvolver = this.ctx.createConvolver();
      this.reverbWet = this.ctx.createGain();
      this.reverbConvolver.buffer = buildReverbImpulse(this.ctx, 2.2, this.fxState.reverb.decay);
      this.fxBus.connect(this.reverbConvolver);
      this.reverbConvolver.connect(this.reverbWet);
      this.reverbWet.connect(this.master);

      this.applyFxInternal();

      this.master.connect(this.ctx.destination);
      this.metroGain = this.ctx.createGain();
      this.metroGain.gain.value = 0.35;
      this.metroGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  private applyBandToFilter(filter: BiquadFilterNode, band: EqBand, enabled: boolean) {
    filter.type = band.type;
    filter.frequency.value = band.frequency;
    filter.Q.value = band.q;
    filter.gain.value = enabled ? band.gainDb : 0;
  }

  setEq(state: EqState) {
    this.eqState = {
      enabled: state.enabled,
      bands: state.bands.map((b) => ({ ...b })),
    };
    for (let i = 0; i < this.eqFilters.length; i++) {
      const band = this.eqState.bands[i];
      const filter = this.eqFilters[i];
      if (!band || !filter) continue;
      this.applyBandToFilter(filter, band, this.eqState.enabled);
    }
  }

  getEq(): EqState {
    return {
      enabled: this.eqState.enabled,
      bands: this.eqState.bands.map((b) => ({ ...b })),
    };
  }

  setFx(state: FxState) {
    this.fxState = structuredClone(state);
    this.applyFxInternal();
  }

  getFx(): FxState {
    return structuredClone(this.fxState);
  }

  private applyFxInternal() {
    if (!this.compressor || !this.delayNode || !this.delayFeedback || !this.delayWet) return;
    if (!this.reverbConvolver || !this.reverbWet || !this.ctx) return;

    const fx = this.fxState;
    const masterOn = fx.enabled;

    const c = fx.compressor;
    this.compressor.threshold.value = c.enabled && masterOn ? c.threshold : 0;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = c.enabled && masterOn ? c.ratio : 1;
    this.compressor.attack.value = c.attack;
    this.compressor.release.value = c.release;

    const d = fx.delay;
    this.delayNode.delayTime.value = d.timeSec;
    this.delayFeedback.gain.value = d.enabled && masterOn ? d.feedback : 0;
    this.delayWet.gain.value = d.enabled && masterOn ? d.mix : 0;

    const r = fx.reverb;
    this.reverbWet.gain.value = r.enabled && masterOn ? r.mix : 0;
    if (Math.abs(r.decay - this.lastReverbDecay) > 0.02) {
      this.reverbConvolver.buffer = buildReverbImpulse(this.ctx, 2.2, r.decay);
      this.lastReverbDecay = r.decay;
    }
  }

  async loadStem(id: StemId, arrayBuffer: ArrayBuffer): Promise<void> {
    const ctx = await this.ensureContext();
    const raw = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.duration = Math.max(this.duration, raw.duration);

    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    gain.connect(pan);
    pan.connect(this.eqInput ?? this.master!);

    const existing = this.stems.get(id);
    if (existing?.source) {
      try {
        existing.source.stop();
      } catch {
        /* already stopped */
      }
    }

    const buffer = applySpeedAndPitch(ctx, raw, this.speedPct, this.pitchSemitones);
    this.stems.set(id, { raw, buffer, gain, pan, source: null });
    if (!this.configs.has(id)) {
      this.configs.set(id, { volume: 1, mute: false, solo: false, pan: 0 });
    }
    this.applyChannel(id);
  }

  /** Buffers originais (pré stretch) — para análise BPM/key. */
  getRawBuffers(): AudioBuffer[] {
    return [...this.stems.values()].map((s) => s.raw);
  }

  setMasterGain(value: number) {
    this.masterGain = value;
    if (this.master) this.master.gain.value = value;
  }

  setChannel(id: StemId, config: Partial<StemChannelConfig>) {
    const cur = this.configs.get(id) ?? { volume: 1, mute: false, solo: false, pan: 0 };
    this.configs.set(id, { ...cur, ...config });
    this.applyChannel(id);
  }

  getChannel(id: StemId): StemChannelConfig | undefined {
    return this.configs.get(id);
  }

  setLoop(region: LoopRegion) {
    if (region && region.end <= region.start) {
      this.loop = null;
      return;
    }
    this.loop = region;
  }

  getLoop(): LoopRegion {
    return this.loop;
  }

  setMetronome(enabled: boolean, bpm?: number) {
    this.metronomeEnabled = enabled;
    if (bpm != null) this.metronomeBpm = Math.max(30, Math.min(300, bpm));
    if (!enabled) this.clearClicks();
  }

  getMetronomeBpm(): number {
    return this.metronomeBpm;
  }

  getSpeedPct(): number {
    return this.speedPct;
  }

  getPitchSemitones(): number {
    return this.pitchSemitones;
  }

  /**
   * Velocidade 50–150% com preservação de pitch (WSOLA).
   * Reprocessa buffers; retoma a posição de conteúdo se estava tocando.
   */
  async setSpeedPct(pct: number): Promise<void> {
    const next = Math.max(50, Math.min(150, Math.round(pct)));
    if (next === this.speedPct) return;
    this.speedPct = next;
    await this.rebuildPlaybackBuffers();
  }

  /** Pitch −12..+12 semitons, duração preservada. */
  async setPitchSemitones(semitones: number): Promise<void> {
    const next = Math.max(-12, Math.min(12, Math.round(semitones)));
    if (next === this.pitchSemitones) return;
    this.pitchSemitones = next;
    await this.rebuildPlaybackBuffers();
  }

  private async rebuildPlaybackBuffers(): Promise<void> {
    const ctx = await this.ensureContext();
    const token = ++this.rebuildToken;
    const wasPlaying = this.playing;
    const t = this.getCurrentTime();
    this.stopSources(false);
    this.clearClicks();
    this.playing = false;
    if (typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.raf);
    }

    // Neutro: só aponta para o buffer cru (sem WSOLA) — instantâneo
    if (this.speedPct === 100 && this.pitchSemitones === 0) {
      for (const nodes of this.stems.values()) {
        nodes.buffer = nodes.raw;
      }
    } else {
      for (const nodes of this.stems.values()) {
        if (token !== this.rebuildToken) return;
        nodes.buffer = await applySpeedAndPitchAsync(
          ctx,
          nodes.raw,
          this.speedPct,
          this.pitchSemitones,
          { quality: "fast" },
        );
        // Cede a thread entre stems
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
    if (token !== this.rebuildToken) return;

    this.offsetWhenStarted = t;
    this.listeners.time?.(t);
    this.listeners.state?.(false);
    if (wasPlaying) await this.play(t);
  }

  /** Fator wall-clock: conteúdo avança mais devagar quando speed < 100. */
  private contentRate(): number {
    return this.speedPct / 100;
  }

  /** Converte segundos de conteúdo → offset no buffer stretched. */
  private toPlaybackOffset(contentSec: number): number {
    const rate = this.contentRate();
    return rate > 0 ? contentSec / rate : contentSec;
  }

  getDuration(): number {
    return this.duration;
  }

  getCurrentTime(): number {
    if (!this.ctx || !this.playing) return this.offsetWhenStarted;
    const wall = this.ctx.currentTime - this.startedAtCtx;
    const raw = this.offsetWhenStarted + wall * this.contentRate();
    if (this.loop) {
      return Math.min(this.loop.end, Math.max(this.loop.start, raw));
    }
    return Math.min(this.duration, raw);
  }

  isPlaying(): boolean {
    return this.playing && this.ctx?.state === "running";
  }

  private anySolo(): boolean {
    for (const c of this.configs.values()) {
      if (c.solo) return true;
    }
    return false;
  }

  private applyChannel(id: StemId) {
    const nodes = this.stems.get(id);
    const cfg = this.configs.get(id);
    if (!nodes || !cfg) return;
    const soloMode = this.anySolo();
    const audible = !cfg.mute && (!soloMode || cfg.solo);
    nodes.gain.gain.value = audible ? cfg.volume : 0;
    nodes.pan.pan.value = cfg.pan;
  }

  applyAllChannels() {
    for (const id of this.stems.keys()) this.applyChannel(id);
  }

  /** Contagem inicial (cliques) antes do play — retorna Promise quando terminar. */
  async countdown(beats = 4): Promise<void> {
    const ctx = await this.ensureContext();
    const interval = 60 / this.effectiveMetroBpm();
    const startAt = ctx.currentTime + 0.05;
    for (let i = 0; i < beats; i++) {
      this.scheduleClick(startAt + i * interval, i === 0);
    }
    await new Promise((r) => setTimeout(r, (beats * interval + 0.05) * 1000));
  }

  /** BPM do metrônomo escalado pela velocidade de prática. */
  private effectiveMetroBpm(): number {
    return Math.max(30, this.metronomeBpm * this.contentRate());
  }

  /** Garante saída audível (getUserMedia costuma suspender o AudioContext). */
  async resumeOutput(): Promise<void> {
    await this.unlockOutput();
  }

  /** Expõe o context para FX de mic/ensaio no mesmo grafo (evita 2º AudioContext mudo). */
  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  async ensureAudioContext(): Promise<AudioContext> {
    return this.ensureContext();
  }

  /**
   * Resume + “desbloqueia” a saída. Retorna false se o context continuar suspenso
   * (aí a UI deve pedir gesto / fones).
   */
  async unlockOutput(): Promise<boolean> {
    const ctx = await this.ensureContext();
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    if (ctx.state !== "running") return false;
    // impulso silencioso — força rota de saída após mic no Windows/Chrome
    try {
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(g);
      g.connect(ctx.destination);
      src.start();
    } catch {
      /* ignore */
    }
    return ctx.state === "running";
  }

  isOutputAlive(): boolean {
    return this.ctx?.state === "running";
  }

  /**
   * Inicia/reinicia reprodução. Sempre recria sources após resume —
   * necessário no monitor de gravação (mic pode deixar o context “playing” sem som).
   */
  async play(fromSeconds?: number) {
    const ctx = await this.ensureContext();
    if (ctx.state !== "running") {
      await ctx.resume();
    }
    let startOffset = fromSeconds ?? this.getCurrentTime();
    if (this.loop) {
      if (startOffset < this.loop.start || startOffset >= this.loop.end) {
        startOffset = this.loop.start;
      }
    }
    this.stopSources(false);
    this.clearClicks();
    const when = ctx.currentTime + 0.05;
    this.startedAtCtx = when;
    this.offsetWhenStarted = Math.max(0, Math.min(startOffset, this.duration));

    const playOffset = this.toPlaybackOffset(this.offsetWhenStarted);
    for (const [, nodes] of this.stems) {
      const src = ctx.createBufferSource();
      src.buffer = nodes.buffer;
      src.connect(nodes.gain);
      if (this.loop) {
        const playDurContent = Math.max(0.01, this.loop.end - this.offsetWhenStarted);
        const playDur = playDurContent / this.contentRate();
        src.start(when, playOffset, playDur);
      } else {
        src.start(when, playOffset);
      }
      nodes.source = src;
    }

    if (this.metronomeEnabled) {
      this.armMetronomeClicks(when, this.offsetWhenStarted);
    }

    this.playing = true;
    this.listeners.state?.(true);
    this.tick();
  }

  getContextState(): AudioContextState | "none" {
    return this.ctx?.state ?? "none";
  }

  pause() {
    const t = this.getCurrentTime();
    this.stopSources(false);
    this.clearClicks();
    this.offsetWhenStarted = t;
    this.playing = false;
    this.listeners.state?.(false);
    this.listeners.time?.(t);
    if (typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.raf);
    }
  }

  seek(seconds: number) {
    const wasPlaying = this.playing;
    let t = Math.max(0, Math.min(seconds, this.duration));
    if (this.loop) {
      t = Math.max(this.loop.start, Math.min(t, this.loop.end));
    }
    this.offsetWhenStarted = t;
    this.listeners.time?.(this.offsetWhenStarted);
    if (wasPlaying) void this.play(this.offsetWhenStarted);
  }

  private armMetronomeClicks(whenCtx: number, offsetSec: number) {
    const bpm = this.effectiveMetroBpm();
    const interval = 60 / bpm;
    // Batidas no domínio do conteúdo musical (BPM do projeto)
    const contentInterval = 60 / this.metronomeBpm;
    const beatIndex = Math.floor(offsetSec / contentInterval);
    this.nextClickBeat = beatIndex;
    const horizon = 8;
    for (let i = 0; i < Math.ceil(horizon / interval) + 2; i++) {
      const beat = beatIndex + i;
      const beatTime = beat * contentInterval;
      if (this.loop && beatTime >= this.loop.end) break;
      if (beatTime < offsetSec - 0.001) continue;
      const contentDelta = beatTime - offsetSec;
      const at = whenCtx + contentDelta / this.contentRate();
      this.scheduleClick(at, beat % 4 === 0);
    }
  }

  private scheduleClick(at: number, accent: boolean) {
    if (!this.ctx || !this.metroGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.value = accent ? 1200 : 800;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.4, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(g);
    g.connect(this.metroGain);
    osc.start(at);
    osc.stop(at + 0.07);
    this.scheduledClicks.push(osc);
  }

  private clearClicks() {
    for (const osc of this.scheduledClicks) {
      try {
        osc.stop();
      } catch {
        /* ignore */
      }
    }
    this.scheduledClicks = [];
  }

  private stopSources(emitEnded: boolean) {
    for (const nodes of this.stems.values()) {
      if (nodes.source) {
        try {
          nodes.source.stop();
        } catch {
          /* ignore */
        }
        nodes.source.disconnect();
        nodes.source = null;
      }
    }
    if (emitEnded) this.listeners.ended?.();
  }

  private tick = () => {
    if (!this.playing) return;
    const t = this.getCurrentTime();
    this.listeners.time?.(t);

    if (this.loop && t >= this.loop.end - 0.03) {
      this.listeners.loop?.();
      void this.play(this.loop.start);
      return;
    }

    if (!this.loop && t >= this.duration - 0.02) {
      this.pause();
      this.offsetWhenStarted = this.duration;
      this.listeners.ended?.();
      return;
    }
    if (typeof requestAnimationFrame !== "undefined") {
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  /** Remove stems carregados (ex.: troca A/B de job) sem fechar o contexto. */
  clearStems() {
    this.stopSources(false);
    this.clearClicks();
    this.stems.clear();
    this.configs.clear();
    this.duration = 0;
    this.offsetWhenStarted = 0;
    this.playing = false;
  }

  dispose() {
    this.pause();
    this.stems.clear();
    this.configs.clear();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.eqInput = null;
    this.eqFilters = [];
    this.compressor = null;
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayWet = null;
    this.reverbConvolver = null;
    this.reverbWet = null;
    this.fxBus = null;
    this.metroGain = null;
  }
}
