import { describe, expect, it } from "vitest";

import {
  estimateExportBytes,
  formatAllowed,
  hasEnoughDisk,
  parseTempo,
  progressFromStatus,
  sanitizeFilename,
} from "./export-job";

describe("export-job helpers", () => {
  it("sanitizeFilename remove caracteres inválidos e adiciona extensão", () => {
    expect(sanitizeFilename('Meu Disco: "Hit"', "wav")).toMatch(/\.wav$/);
    expect(sanitizeFilename('Meu Disco: "Hit"', "wav")).not.toMatch(/[<>:"/\\|?*]/);
    expect(sanitizeFilename("mix.wav", "wav")).toBe("mix.wav");
  });

  it("formatAllowed respeita modos", () => {
    expect(formatAllowed("stem", "wav")).toBe(true);
    expect(formatAllowed("stem", "mp3")).toBe(true);
    expect(formatAllowed("all_tracks", "zip")).toBe(true);
    expect(formatAllowed("all_tracks", "mp3")).toBe(true);
    expect(formatAllowed("custom_mix", "mp3")).toBe(true);
    expect(formatAllowed("custom_mix", "zip")).toBe(false);
  });

  it("estimateExportBytes soma stems ou média no mix", () => {
    expect(estimateExportBytes("stem", "wav", [100, 200], [100, 200, 300])).toBe(300);
    expect(estimateExportBytes("all_tracks", "zip", [100], [100, 200])).toBe(Math.ceil(300 * 1.05));
    expect(estimateExportBytes("custom_mix", "wav", [], [100, 300])).toBe(200);
  });

  it("hasEnoughDisk bloqueia quando livre é baixo", () => {
    expect(hasEnoughDisk(null, 1e9).ok).toBe(true);
    expect(hasEnoughDisk(1_000_000, 500_000_000).ok).toBe(false);
    expect(hasEnoughDisk(2_000_000_000, 10_000_000).ok).toBe(true);
  });

  it("progressFromStatus mapeia fases", () => {
    expect(progressFromStatus("queued", "queued")).toBe(20);
    expect(progressFromStatus("processing", "processing")).toBe(55);
    expect(progressFromStatus("completed", "done")).toBe(100);
  });
});

describe("exportação: formatos e trecho", () => {
  it("todos os modos de áudio aceitam FLAC, M4A e OGG; o ZIP também", () => {
    expect(formatAllowed("stem", "flac")).toBe(true);
    expect(formatAllowed("custom_mix", "m4a")).toBe(true);
    expect(formatAllowed("all_tracks", "ogg")).toBe(true);
    expect(formatAllowed("stem", "zip")).toBe(false);
  });

  it("lê o trecho em segundos ou minutos:segundos", () => {
    expect(parseTempo("")).toBeUndefined();
    expect(parseTempo("83")).toBe(83);
    expect(parseTempo("1:23")).toBe(83);
    expect(parseTempo("1:02,5")).toBe(62.5);
    expect(parseTempo("abc")).toBeNull();
    expect(parseTempo("-3")).toBeNull();
  });
});
