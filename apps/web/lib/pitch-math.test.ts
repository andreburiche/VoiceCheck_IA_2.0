import { describe, expect, it } from "vitest";

import { centsBetweenHz, hzToMidi, midiToHz, midiToNoteName } from "@/lib/pitch-math";

describe("pitch-math", () => {
  it("A4 = 440 Hz → midi 69", () => {
    expect(hzToMidi(440)).toBe(69);
    expect(midiToNoteName(69)).toBe("A4");
  });

  it("cents: oitava = 1200", () => {
    expect(Math.round(centsBetweenHz(880, 440))).toBe(1200);
  });

  it("midi ↔ hz roundtrip aproximado", () => {
    expect(Math.round(midiToHz(60))).toBe(262);
  });
});
