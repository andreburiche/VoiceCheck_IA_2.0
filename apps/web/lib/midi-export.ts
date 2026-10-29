/**
 * Estimativa experimental de notas → arquivo MIDI Type 0.
 * Usa autocorrelação (YIN simplificado) — qualidade limitada em polifonia.
 */

export type MidiNoteEvent = {
  midi: number;
  startSec: number;
  durationSec: number;
  velocity: number;
};

function hzToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

/** Detecta pitch dominante por frames via autocorrelação. */
export function estimateNotesFromBuffer(
  buffer: AudioBuffer,
  opts?: { hopSec?: number; minHz?: number; maxHz?: number },
): MidiNoteEvent[] {
  const hopSec = opts?.hopSec ?? 0.05;
  const minHz = opts?.minHz ?? 80;
  const maxHz = opts?.maxHz ?? 1000;
  const sr = buffer.sampleRate;
  const hop = Math.max(1, Math.floor(sr * hopSec));
  const win = Math.max(hop * 2, Math.floor(sr * 0.04));
  const channel = buffer.getChannelData(0);
  const minLag = Math.floor(sr / maxHz);
  const maxLag = Math.floor(sr / minHz);

  const frames: { t: number; midi: number | null; amp: number }[] = [];

  for (let start = 0; start + win < channel.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < win; i++) {
      const s = channel[start + i] ?? 0;
      energy += s * s;
    }
    const amp = Math.sqrt(energy / win);
    if (amp < 0.01) {
      frames.push({ t: start / sr, midi: null, amp });
      continue;
    }

    let bestLag = 0;
    let bestCorr = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      let norm = 0;
      for (let i = 0; i < win - lag; i++) {
        const a = channel[start + i] ?? 0;
        const b = channel[start + i + lag] ?? 0;
        corr += a * b;
        norm += a * a;
      }
      const c = norm > 0 ? corr / norm : 0;
      if (c > bestCorr) {
        bestCorr = c;
        bestLag = lag;
      }
    }

    if (bestCorr < 0.3 || bestLag <= 0) {
      frames.push({ t: start / sr, midi: null, amp });
      continue;
    }
    const hz = sr / bestLag;
    const midi = hzToMidi(hz);
    if (midi < 36 || midi > 84) {
      frames.push({ t: start / sr, midi: null, amp });
      continue;
    }
    frames.push({ t: start / sr, midi, amp });
  }

  // Agrupa frames estáveis em notas
  const notes: MidiNoteEvent[] = [];
  let cur: MidiNoteEvent | null = null;
  for (const f of frames) {
    if (f.midi == null) {
      if (cur) {
        notes.push(cur);
        cur = null;
      }
      continue;
    }
    if (!cur || cur.midi !== f.midi) {
      if (cur) notes.push(cur);
      cur = {
        midi: f.midi,
        startSec: f.t,
        durationSec: hopSec,
        velocity: Math.max(40, Math.min(110, Math.round(f.amp * 400))),
      };
    } else {
      cur.durationSec += hopSec;
    }
  }
  if (cur) notes.push(cur);

  return notes.filter((n) => n.durationSec >= hopSec * 1.5).slice(0, 500);
}

function writeVarLen(value: number): number[] {
  let buffer = value & 0x7f;
  const out: number[] = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    out.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return out;
}

/** Gera MIDI Type 0 a partir de notas (ticks = 480 PPQ, tempo 120 BPM). */
export function notesToMidiBlob(notes: MidiNoteEvent[], bpm = 120): Blob {
  const ppq = 480;
  const tempo = Math.round(60_000_000 / bpm);
  const ticksPerSec = (ppq * bpm) / 60;

  const events: { tick: number; data: number[] }[] = [];
  // set tempo
  events.push({
    tick: 0,
    data: [0xff, 0x51, 0x03, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff],
  });

  for (const n of notes) {
    const on = Math.round(n.startSec * ticksPerSec);
    const off = Math.round((n.startSec + n.durationSec) * ticksPerSec);
    events.push({ tick: on, data: [0x90, n.midi & 0x7f, n.velocity & 0x7f] });
    events.push({ tick: Math.max(on + 1, off), data: [0x80, n.midi & 0x7f, 0x40] });
  }
  events.sort((a, b) => a.tick - b.tick || a.data[0]! - b.data[0]!);

  const track: number[] = [];
  let last = 0;
  for (const ev of events) {
    const delta = Math.max(0, ev.tick - last);
    last = ev.tick;
    track.push(...writeVarLen(delta), ...ev.data);
  }
  track.push(...writeVarLen(0), 0xff, 0x2f, 0x00); // end of track

  const trackLen = track.length;
  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    0, 0, 0, 6,
    0, 0, // format 0
    0, 1, // one track
    (ppq >> 8) & 0xff,
    ppq & 0xff,
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    (trackLen >> 24) & 0xff,
    (trackLen >> 16) & 0xff,
    (trackLen >> 8) & 0xff,
    trackLen & 0xff,
  ];

  const bytes = new Uint8Array(header.length + track.length);
  bytes.set(header, 0);
  bytes.set(track, header.length);
  return new Blob([bytes], { type: "audio/midi" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
