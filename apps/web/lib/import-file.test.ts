import { describe, expect, it } from "vitest";

import { detectFormat, guessMime, validateImportFile } from "@/lib/import-file";

describe("import-file", () => {
  it("detecta formatos suportados", () => {
    expect(detectFormat("a.mp3", "")).toBe("mp3");
    expect(detectFormat("a.WAV", "")).toBe("wav");
    expect(guessMime("x.flac")).toBe("audio/flac");
  });

  it("rejeita extensão inválida", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "doc.pdf", { type: "application/pdf" });
    const r = validateImportFile(file, { maxBytes: 10_000_000 });
    expect(r.ok).toBe(false);
  });

  it("rejeita arquivo acima do limite", () => {
    const file = new File([new Uint8Array(100)], "a.mp3", { type: "audio/mpeg" });
    Object.defineProperty(file, "size", { value: 200 });
    const r = validateImportFile(file, { maxBytes: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/limite/i);
  });

  it("aceita mp3 dentro do limite", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "track.mp3", { type: "audio/mpeg" });
    expect(validateImportFile(file, { maxBytes: 10_000_000 }).ok).toBe(true);
  });
});
