import { describe, expect, it } from "vitest";

import {
  groupModels,
  isBasicFourStem,
  packageStatusOf,
  verifyModelIntegrity,
} from "./ai-models";
import type { SeparationModelInfo, SystemStatus } from "./api";

function model(partial: Partial<SeparationModelInfo> & Pick<SeparationModelInfo, "code">): SeparationModelInfo {
  return {
    tier: "basic",
    label: partial.code,
    name: partial.code,
    description: "",
    stems: ["vocals", "drums", "bass", "other"],
    min_vram_mb: 4096,
    cpu_ok: true,
    version: "1",
    installed: false,
    compatible: false,
    selectable: false,
    reason: "x",
    device: "cpu",
    ...partial,
  };
}

describe("ai-models", () => {
  it("agrupa por package_status", () => {
    const groups = groupModels([
      model({ code: "a", installed: true, selectable: true, package_status: "installed" }),
      model({ code: "b", package_status: "available" }),
      model({ code: "c", installed: true, selectable: false, package_status: "incompatible" }),
    ]);
    expect(groups.installed).toHaveLength(1);
    expect(groups.available).toHaveLength(1);
    expect(groups.incompatible).toHaveLength(1);
  });

  it("destaca básico 4 fontes", () => {
    expect(isBasicFourStem(model({ code: "htdemucs" }))).toBe(true);
    expect(isBasicFourStem(model({ code: "other", stems: ["vocals"] }))).toBe(false);
  });

  it("verifyModelIntegrity falha sem status", () => {
    expect(verifyModelIntegrity(undefined, "htdemucs").ok).toBe(false);
  });

  it("verifyModelIntegrity OK quando instalado e selecionável", () => {
    const status = {
      env: "dev",
      separation_adapter: "cpu_demucs",
      allow_contract_stems: false,
      using_contract_silence: false,
      storage_backend: "local",
      message: "ok",
      models: [model({ code: "htdemucs", installed: true, selectable: true, version: "4.0.1" })],
    } as SystemStatus;
    const r = verifyModelIntegrity(status, "htdemucs");
    expect(r.ok).toBe(true);
    expect(r.messages.length).toBeGreaterThan(2);
  });

  it("packageStatusOf deriva de flags", () => {
    expect(packageStatusOf(model({ code: "x", installed: true, selectable: true }))).toBe("installed");
    expect(packageStatusOf(model({ code: "y", installed: false }))).toBe("available");
  });
});
