import { describe, expect, it } from "vitest";

import { analyzeAudioBuffers, buildBeatGrid, mixToMono } from "./audio-analysis";

function fakeBuffer(samples: Float32Array, sampleRate = 22050): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: samples.length,
    sampleRate,
    duration: samples.length / sampleRate,
    getChannelData: () => samples,
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

describe("audio-analysis", () => {
  it("mixToMono normaliza pico", () => {
    const a = fakeBuffer(new Float32Array([0, 0.5, -0.5, 0]));
    const mono = mixToMono([a]);
    expect(Math.max(...mono.map(Math.abs))).toBeCloseTo(1, 5);
  });

  it("detecta BPM aproximado de click track 120", () => {
    const sr = 22050;
    const seconds = 8;
    const bpm = 120;
    const samples = new Float32Array(sr * seconds);
    const interval = Math.floor((60 / bpm) * sr);
    for (let i = 0; i < samples.length; i += interval) {
      for (let n = 0; n < 40 && i + n < samples.length; n++) {
        samples[i + n] = 1 - n / 40;
      }
    }
    const result = analyzeAudioBuffers([fakeBuffer(samples, sr)]);
    expect(result).not.toBeNull();
    expect(result!.bpm).toBeGreaterThanOrEqual(100);
    expect(result!.bpm).toBeLessThanOrEqual(140);
    expect(result!.musical_key.length).toBeGreaterThan(0);
    expect(typeof result!.chords).toBe("string");
    expect(result!.duration_sec).toBeGreaterThan(0);
    expect(result!.beat_times_sec.length).toBeGreaterThan(0);
  });

  it("monta grade de batidas a partir do BPM", () => {
    const beats = buildBeatGrid(4, 120);
    expect(beats[0]).toBe(0);
    expect(beats.length).toBeGreaterThanOrEqual(8);
  });
});
