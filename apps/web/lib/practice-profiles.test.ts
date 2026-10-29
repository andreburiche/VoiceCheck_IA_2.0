import { describe, expect, it } from "vitest";

import {
  getPracticeProfile,
  mixForProfile,
  mutedStemForProfile,
} from "./practice-profiles";

describe("mixForProfile", () => {
  it("mute vocals no perfil voz", () => {
    const mix = mixForProfile("singer");
    expect(mix.vocals?.mute).toBe(true);
    expect(mix.drums?.mute).toBe(false);
  });

  it("geral sem mutes", () => {
    const mix = mixForProfile("general");
    expect(Object.values(mix).every((c) => !c.mute)).toBe(true);
  });

  it("violão e guitarra usam other sem isolamento dedicado", () => {
    expect(getPracticeProfile("acoustic").isolated).toBe(false);
    expect(getPracticeProfile("guitar").isolated).toBe(false);
    expect(mutedStemForProfile("acoustic")).toBe("other");
    expect(getPracticeProfile("acoustic").limitation).toBeTruthy();
  });

  it("voz tem stem isolado", () => {
    expect(getPracticeProfile("singer").isolated).toBe(true);
    expect(mutedStemForProfile("singer")).toBe("vocals");
  });
});
