import { describe, expect, it } from "vitest";

import { defaultEqState, normalizeEqState } from "./eq";

describe("eq", () => {
  it("defaultEqState tem 5 bandas neutras", () => {
    const eq = defaultEqState();
    expect(eq.enabled).toBe(true);
    expect(eq.bands).toHaveLength(5);
    expect(eq.bands.every((b) => b.gainDb === 0)).toBe(true);
  });

  it("normalizeEqState mescla e limita gain", () => {
    const eq = normalizeEqState({
      enabled: false,
      bands: [{ id: "low", gainDb: 99 }, { id: "mid", gainDb: -20 }],
    });
    expect(eq.enabled).toBe(false);
    expect(eq.bands[0]!.gainDb).toBe(12);
    expect(eq.bands.find((b) => b.id === "mid")?.gainDb).toBe(-12);
  });
});
