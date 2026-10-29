import { describe, expect, it } from "vitest";

import { AudioEngine } from "./audio-engine";

describe("AudioEngine", () => {
  it("inicia parado sem duração", () => {
    const eng = new AudioEngine();
    expect(eng.isPlaying()).toBe(false);
    expect(eng.getDuration()).toBe(0);
    expect(eng.getCurrentTime()).toBe(0);
    eng.dispose();
  });

  it("aplica config de canal em memória", () => {
    const eng = new AudioEngine();
    eng.setChannel("vocals", { volume: 0.5, mute: true, solo: false, pan: -0.2 });
    expect(eng.getChannel("vocals")).toEqual({
      volume: 0.5,
      mute: true,
      solo: false,
      pan: -0.2,
    });
    eng.dispose();
  });

  it("define loop e metrônomo", () => {
    const eng = new AudioEngine();
    eng.setLoop({ start: 1, end: 4 });
    expect(eng.getLoop()).toEqual({ start: 1, end: 4 });
    eng.setLoop({ start: 5, end: 2 });
    expect(eng.getLoop()).toBeNull();
    eng.setMetronome(true, 90);
    expect(eng.getMetronomeBpm()).toBe(90);
    eng.dispose();
  });

  it("expõe defaults de velocidade e pitch", () => {
    const eng = new AudioEngine();
    expect(eng.getSpeedPct()).toBe(100);
    expect(eng.getPitchSemitones()).toBe(0);
    eng.dispose();
  });

  it("guarda estado de EQ em memória", () => {
    const eng = new AudioEngine();
    const eq = eng.getEq();
    expect(eq.bands).toHaveLength(5);
    eng.setEq({
      enabled: false,
      bands: eq.bands.map((b, i) => (i === 0 ? { ...b, gainDb: 3 } : b)),
    });
    expect(eng.getEq().enabled).toBe(false);
    expect(eng.getEq().bands[0]?.gainDb).toBe(3);
    eng.dispose();
  });

  it("guarda estado de FX em memória", () => {
    const eng = new AudioEngine();
    const fx = eng.getFx();
    expect(fx.delay.enabled).toBe(false);
    eng.setFx({
      ...fx,
      delay: { ...fx.delay, enabled: true, mix: 0.4 },
      reverb: { ...fx.reverb, enabled: true, mix: 0.2 },
    });
    expect(eng.getFx().delay.enabled).toBe(true);
    expect(eng.getFx().delay.mix).toBe(0.4);
    expect(eng.getFx().reverb.enabled).toBe(true);
    eng.dispose();
  });
});

