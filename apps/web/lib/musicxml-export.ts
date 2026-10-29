import type { MidiNoteEvent } from "@/lib/midi-export";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

function midiToStepAlterOctave(midi: number): { step: string; alter: number; octave: number } {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[pc]!;
  if (name.length === 1) return { step: name, alter: 0, octave };
  return { step: name[0]!, alter: 1, octave };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildMeasures(
  notes: MidiNoteEvent[],
  bpm: number,
  voiceNum = 1,
): string {
  const divisions = 24;
  const beatMs = 60_000 / bpm;
  const measures: string[] = [];
  let measureNotes = "";
  let usedDivs = 0;
  let measureNum = 1;

  function flushMeasure(attrs = false) {
    const attrXml = attrs
      ? `<attributes>
  <divisions>${divisions}</divisions>
  <key><fifths>0</fifths></key>
  <time><beats>4</beats><beat-type>4</beat-type></time>
  <clef><sign>G</sign><line>2</line></clef>
</attributes>`
      : "";
    const remaining = divisions * 4 - usedDivs;
    let restXml = "";
    if (remaining > 0) {
      restXml = `<note><rest/><duration>${remaining}</duration><voice>${voiceNum}</voice><type>quarter</type></note>`;
    }
    measures.push(
      `<measure number="${measureNum}">${attrXml}${measureNotes}${restXml}</measure>`,
    );
    measureNum += 1;
    measureNotes = "";
    usedDivs = 0;
  }

  const sorted = [...notes].sort((a, b) => a.startSec - b.startSec);
  let first = true;
  for (const n of sorted) {
    const durBeats = Math.max(0.25, n.durationSec / (beatMs / 1000));
    let dur = Math.max(1, Math.round(durBeats * divisions));
    const { step, alter, octave } = midiToStepAlterOctave(n.midi);
    const alterXml = alter ? `<alter>${alter}</alter>` : "";

    while (dur > 0) {
      const room = divisions * 4 - usedDivs;
      if (room <= 0) {
        flushMeasure(first);
        first = false;
        continue;
      }
      const slice = Math.min(dur, room);
      measureNotes += `<note>
  <pitch><step>${step}</step>${alterXml}<octave>${octave}</octave></pitch>
  <duration>${slice}</duration>
  <voice>${voiceNum}</voice>
  <type>quarter</type>
</note>`;
      usedDivs += slice;
      dur -= slice;
      if (usedDivs >= divisions * 4) {
        flushMeasure(first);
        first = false;
      }
    }
  }
  if (measureNotes || first) flushMeasure(first);
  return measures.join("\n");
}

/** MusicXML 3.1 partitura monofônica simples (4/4, sem armadura). */
export function notesToMusicXml(
  notes: MidiNoteEvent[],
  opts?: { title?: string; partName?: string; bpm?: number },
): string {
  const title = opts?.title ?? "Transcrição vocal";
  const partName = opts?.partName ?? "Voz principal";
  const bpm = opts?.bpm ?? 120;
  const measures = buildMeasures(notes, bpm, 1);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>${escapeXml(partName)}</part-name></score-part>
  </part-list>
  <part id="P1">
    ${measures}
  </part>
</score-partwise>`;
}

export type MusicXmlPart = {
  id: string;
  name: string;
  notes: MidiNoteEvent[];
};

/** MusicXML multi-parte (SATB manual / vozes N). */
export function partsToMusicXml(
  parts: MusicXmlPart[],
  opts?: { title?: string; bpm?: number },
): string {
  const title = opts?.title ?? "Partitura multi-voz";
  const bpm = opts?.bpm ?? 120;
  const list = parts
    .map(
      (p, i) =>
        `<score-part id="P${i + 1}"><part-name>${escapeXml(p.name)}</part-name></score-part>`,
    )
    .join("\n");
  const bodies = parts
    .map(
      (p, i) =>
        `<part id="P${i + 1}">\n${buildMeasures(p.notes, bpm, i + 1)}\n</part>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <part-list>
    ${list}
  </part-list>
  ${bodies}
</score-partwise>`;
}
