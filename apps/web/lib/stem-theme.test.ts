import { describe, expect, it } from "vitest";

import { STEM_ORDER, formatClock } from "@/lib/stem-theme";

describe("stem-theme", () => {
  it("mantém ordem canônica: 6 instrumentos (guitarra e piano) e o instrumental (2-stem)", () => {
    expect(STEM_ORDER).toEqual(["vocals", "drums", "bass", "guitar", "piano", "other", "instrumental"]);
  });

  it("formata relógio de transporte", () => {
    expect(formatClock(0)).toMatch(/^0:00/);
    expect(formatClock(65.5)).toMatch(/^1:05/);
  });
});
