import { describe, expect, it } from "vitest";

import {
  activeLineIndex,
  bodyToLines,
  emptyLyrics,
  linesToBody,
  lyricsToTxt,
} from "./lyrics-local";

describe("lyrics-local", () => {
  it("bodyToLines / linesToBody roundtrip", () => {
    const lines = bodyToLines("Oi\nMundo\n");
    expect(lines).toHaveLength(3);
    expect(linesToBody(lines)).toBe("Oi\nMundo\n");
  });

  it("activeLineIndex escolhe última linha com startMs <= tempo", () => {
    const lines = bodyToLines("a\nb\nc").map((l, i) => ({
      ...l,
      startMs: i === 0 ? 0 : i === 1 ? 1000 : 2000,
    }));
    expect(activeLineIndex(lines, 500)).toBe(0);
    expect(activeLineIndex(lines, 1500)).toBe(1);
    expect(activeLineIndex(lines, 3000)).toBe(2);
  });

  it("lyricsToTxt inclui timestamps quando houver", () => {
    const doc = emptyLyrics("p1");
    doc.title = "Canção";
    doc.lines = [
      { id: "1", text: "Linha A", startMs: 0 },
      { id: "2", text: "Linha B", startMs: 65000 },
    ];
    const txt = lyricsToTxt(doc);
    expect(txt).toContain("Canção");
    expect(txt).toMatch(/\[0:00\.00\] Linha A/);
    expect(txt).toMatch(/\[1:05\.00\] Linha B/);
  });
});
