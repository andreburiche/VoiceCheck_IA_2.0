import { describe, expect, it } from "vitest";

import { audioBufferToWav } from "./vocal-dsp";

describe("vocal-dsp", () => {
  it("audioBufferToWav gera cabeçalho RIFF válido", () => {
    // Mock mínimo sem AudioContext real
    const fake = {
      numberOfChannels: 1,
      sampleRate: 8000,
      length: 100,
      getChannelData: () => new Float32Array(100),
    } as unknown as AudioBuffer;
    const blob = audioBufferToWav(fake);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 100 * 2);
  });
});
