import { describe, expect, it } from "vitest";

import {
  estimateRemainingMs,
  mapProcessingStages,
  measurableProgress,
} from "@/lib/processing-stages";

describe("processing-stages", () => {
  it("não mostra percentual em queued", () => {
    expect(measurableProgress(0, "queued")).toBeNull();
  });

  it("mostra percentual mensurável em processing", () => {
    expect(measurableProgress(35, "processing")).toBe(35);
  });

  it("mapeia preparing → etapa Preparando em execução", () => {
    const stages = mapProcessingStages("preparing", 15);
    expect(stages.find((s) => s.id === "prepare")?.state).toBe("running");
    expect(stages.find((s) => s.id === "separate")?.state).toBe("wait");
  });

  it("mapeia processing avançado → Separando", () => {
    const stages = mapProcessingStages("processing", 50);
    expect(stages.find((s) => s.id === "load")?.state).toBe("done");
    expect(stages.find((s) => s.id === "separate")?.state).toBe("running");
  });

  it("completed marca todas done", () => {
    expect(mapProcessingStages("completed", 100).every((s) => s.state === "done")).toBe(true);
  });

  it("ETA só com progresso e tempo mínimos", () => {
    const now = Date.now();
    const started = new Date(now - 20_000).toISOString();
    expect(estimateRemainingMs(50, started, now)).toBeGreaterThan(0);
    expect(estimateRemainingMs(50, started, now - 15_000)).toBeNull();
    expect(estimateRemainingMs(3, started, now)).toBeNull();
  });
});

