import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_SETTINGS,
  devicePreferenceAllowed,
  resolveEffectiveDevice,
} from "./app-settings";

describe("app-settings", () => {
  it("defaults sensatos", () => {
    expect(DEFAULT_APP_SETTINGS.devicePreference).toBe("auto");
    expect(DEFAULT_APP_SETTINGS.defaultVolume).toBeGreaterThan(0);
  });

  it("bloqueia GPU sem hardware", () => {
    expect(devicePreferenceAllowed("gpu", false).ok).toBe(false);
    expect(devicePreferenceAllowed("gpu", true).ok).toBe(true);
    expect(devicePreferenceAllowed("auto", false).ok).toBe(true);
  });

  it("resolve dispositivo efetivo", () => {
    expect(resolveEffectiveDevice("auto", "cpu_demucs", false).effective).toBe("cpu");
    expect(resolveEffectiveDevice("auto", "gpu_demucs", true).effective).toBe("gpu");
    expect(resolveEffectiveDevice("cpu", "gpu_demucs", true).effective).toBe("cpu");
    expect(resolveEffectiveDevice("auto", "contract", false).effective).toBe("contract");
  });
});
