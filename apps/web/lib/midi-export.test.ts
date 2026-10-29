import { describe, expect, it } from "vitest";

import { notesToMidiBlob, type MidiNoteEvent } from "./midi-export";

describe("midi-export", () => {
  it("gera blob MIDI com header MThd", async () => {
    const notes: MidiNoteEvent[] = [
      { midi: 60, startSec: 0, durationSec: 0.5, velocity: 80 },
      { midi: 64, startSec: 0.5, durationSec: 0.5, velocity: 70 },
    ];
    const blob = notesToMidiBlob(notes, 120);
    expect(blob.size).toBeGreaterThan(20);
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...buf.slice(0, 4))).toBe("MThd");
  });
});
