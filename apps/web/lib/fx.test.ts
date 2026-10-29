import { describe, expect, it } from "vitest";

import { defaultFxState, normalizeFxState } from "./fx";

describe("fx", () => {
  it("defaultFxState inicia com efeitos desligados", () => {
    const fx = defaultFxState();
    expect(fx.enabled).toBe(true);
    expect(fx.compressor.enabled).toBe(false);
    expect(fx.delay.enabled).toBe(false);
    expect(fx.reverb.enabled).toBe(false);
  });

  it("normalizeFxState limita feedback e mix", () => {
    const fx = normalizeFxState({
      delay: { enabled: true, feedback: 2, mix: 5, timeSec: 9 },
      reverb: { enabled: true, mix: -1, decay: 2 },
    });
    expect(fx.delay.feedback).toBe(0.85);
    expect(fx.delay.mix).toBe(1);
    expect(fx.delay.timeSec).toBe(1);
    expect(fx.reverb.mix).toBe(0);
    expect(fx.reverb.decay).toBe(0.95);
  });
});
