import { describe, expect, it } from "vitest";

import { applySpeedAndPitch, timeStretchBuffer } from "./audio-stretch";

function fakeCtx(): BaseAudioContext {
  return {
    createBuffer(channels: number, length: number, sampleRate: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (ch: number) => data[ch]!,
        copyToChannel(src: Float32Array, ch: number) {
          data[ch]!.set(src);
        },
      } as AudioBuffer;
    },
  } as BaseAudioContext;
}

function toneBuffer(ctx: BaseAudioContext, seconds: number, hz: number, sr = 44100): AudioBuffer {
  const len = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = Math.sin((2 * Math.PI * hz * i) / sr) * 0.5;
  }
  return buf;
}

describe("audio-stretch", () => {
  it("acelera encurtando o buffer (~2x)", () => {
    const ctx = fakeCtx();
    const input = toneBuffer(ctx, 1, 440);
    const out = timeStretchBuffer(ctx, input, 2);
    expect(out.length).toBeLessThan(input.length * 0.6);
    expect(out.length).toBeGreaterThan(input.length * 0.4);
  });

  it("applySpeedAndPitch em 100%/0st clona duração", () => {
    const ctx = fakeCtx();
    const input = toneBuffer(ctx, 0.5, 220);
    const out = applySpeedAndPitch(ctx, input, 100, 0);
    expect(out.length).toBe(input.length);
  });

  it("50% aproximadamente dobra a duração", () => {
    const ctx = fakeCtx();
    const input = toneBuffer(ctx, 0.8, 330);
    const out = applySpeedAndPitch(ctx, input, 50, 0);
    expect(out.length).toBeGreaterThan(input.length * 1.7);
    expect(out.length).toBeLessThan(input.length * 2.3);
  });
});
