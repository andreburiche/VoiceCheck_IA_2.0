/**
 * Gráficos SVG para o PDF VoiceCheck — só a partir de medições do relatório.
 */

import type { VoiceCheckEvent, VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CAT_COLORS: Record<string, string> = {
  possible_voice_break: "#dc2626",
  unstable_sustained_pitch: "#ea580c",
  abrupt_intensity_drop: "#ca8a04",
  possible_clipping: "#b91c1c",
  possible_audible_breath: "#2563eb",
  phrase_pause: "#64748b",
  phrase_micro_gap: "#0d9488",
  regular_vibrato: "#7c3aed",
  irregular_pitch_modulation: "#c026d3",
};

function colorFor(cat: string): string {
  return CAT_COLORS[cat] ?? "#0f766e";
}

/** Contorno F0 (MIDI) + marcadores de ocorrências na linha do tempo. */
export function svgPitchContour(report: VoiceCheckF0Report, events: VoiceCheckEvent[]): string {
  const w = 720;
  const h = 200;
  const pad = { l: 44, r: 12, t: 16, b: 28 };
  const pts = report.pitch_track ?? [];
  const midis = pts
    .map((p) => p.midi_note)
    .filter((m): m is number => m != null && Number.isFinite(m));
  if (!midis.length) {
    return `<svg width="${w}" height="80" viewBox="0 0 ${w} 80" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8fafc" stroke="#e2e8f0"/>
      <text x="24" y="44" fill="#64748b" font-size="12">Sem F0 válido para o gráfico de contorno.</text>
    </svg>`;
  }

  const lo = Math.min(...midis) - 1;
  const hi = Math.max(...midis) + 1;
  const t0 = 0;
  const t1 = Math.max(report.duration_seconds, pts[pts.length - 1]?.time_seconds ?? 1, 0.01);
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const xOf = (t: number) => pad.l + (t / t1) * iw;
  const yOf = (m: number) => pad.t + (1 - (m - lo) / (hi - lo)) * ih;

  // event bands
  const bands = events
    .slice(0, 80)
    .map((ev) => {
      const x1 = xOf(Math.max(0, ev.start_seconds));
      const x2 = xOf(Math.min(t1, Math.max(ev.end_seconds, ev.start_seconds + 0.05)));
      return `<rect x="${x1.toFixed(1)}" y="${pad.t}" width="${Math.max(1.5, x2 - x1).toFixed(1)}" height="${ih}" fill="${colorFor(ev.category)}" opacity="0.18"/>`;
    })
    .join("");

  // pitch path segments
  let d = "";
  let started = false;
  for (const p of pts) {
    if (!p.is_valid || p.midi_note == null) {
      started = false;
      continue;
    }
    const x = xOf(p.time_seconds);
    const y = yOf(p.midi_note);
    d += started ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    started = true;
  }

  // grid notes
  const grid: string[] = [];
  for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
    const y = yOf(m);
    grid.push(
      `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${w - pad.r}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>`,
    );
    if (m % 2 === 0) {
      grid.push(
        `<text x="${pad.l - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" fill="#94a3b8" font-size="9">${m}</text>`,
      );
    }
  }

  // time ticks
  const ticks: string[] = [];
  const nTicks = 6;
  for (let i = 0; i <= nTicks; i++) {
    const t = (t1 * i) / nTicks;
    const x = xOf(t);
    ticks.push(
      `<text x="${x.toFixed(1)}" y="${h - 8}" text-anchor="middle" fill="#94a3b8" font-size="9">${t.toFixed(0)}s</text>`,
    );
  }

  const median = report.observed_range.median_hz;
  let medianLine = "";
  if (median != null && median > 0) {
    const midi = 69 + 12 * Math.log2(median / 440);
    if (midi >= lo && midi <= hi) {
      const y = yOf(midi);
      medianLine = `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${w - pad.r}" y2="${y.toFixed(1)}" stroke="#0d9488" stroke-dasharray="4 3" stroke-width="1.2"/>
        <text x="${w - pad.r}" y="${(y - 4).toFixed(1)}" text-anchor="end" fill="#0f766e" font-size="9">mediana</text>`;
    }
  }

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contorno de F0">
    <rect width="100%" height="100%" fill="#f8fafc" stroke="#e2e8f0"/>
    ${grid.join("")}
    ${bands}
    ${medianLine}
    <path d="${d}" fill="none" stroke="#5b21b6" stroke-width="1.6" stroke-linejoin="round"/>
    <text x="${pad.l}" y="12" fill="#64748b" font-size="9">MIDI ↑ · faixas coloridas = ocorrências</text>
    ${ticks.join("")}
  </svg>`;
}

/** Barras: distribuição de categorias de ocorrência. */
export function svgCategoryBars(events: VoiceCheckEvent[]): string {
  const w = 720;
  const counts = new Map<string, number>();
  for (const ev of events) {
    const k = ev.title || ev.category;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!rows.length) {
    return `<p class="muted">Sem ocorrências para o gráfico de categorias.</p>`;
  }
  const rowH = 22;
  const h = rows.length * rowH + 16;
  const max = Math.max(...rows.map((r) => r[1]), 1);
  const barMax = 420;
  const bars = rows
    .map(([label, n], i) => {
      const y = 8 + i * rowH;
      const bw = (n / max) * barMax;
      const cat = events.find((e) => (e.title || e.category) === label)?.category ?? "";
      return `
        <text x="8" y="${y + 12}" fill="#334155" font-size="10">${esc(label.length > 36 ? label.slice(0, 34) + "…" : label)}</text>
        <rect x="260" y="${y + 2}" width="${bw.toFixed(1)}" height="14" rx="3" fill="${colorFor(cat)}" opacity="0.85"/>
        <text x="${(268 + bw).toFixed(1)}" y="${y + 13}" fill="#475569" font-size="10">${n}</text>`;
    })
    .join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Distribuição de ocorrências">
    <rect width="100%" height="100%" fill="#fff" stroke="#e2e8f0"/>
    ${bars}
  </svg>`;
}

/** Histograma de notas predominantes. */
export function svgNoteHistogram(hist: Record<string, number>): string {
  const entries = Object.entries(hist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  if (!entries.length) {
    return `<p class="muted">Sem histograma de notas (poucos frames válidos).</p>`;
  }
  const w = 720;
  const h = 140;
  const pad = { l: 36, r: 12, t: 16, b: 36 };
  const max = Math.max(...entries.map((e) => e[1]), 1);
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const bw = iw / entries.length;
  const bars = entries
    .map(([note, n], i) => {
      const bh = (n / max) * ih;
      const x = pad.l + i * bw + 2;
      const y = pad.t + ih - bh;
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${bh.toFixed(1)}" fill="#0d9488" opacity="0.85" rx="2"/>
        <text x="${(x + (bw - 4) / 2).toFixed(1)}" y="${h - 18}" text-anchor="middle" fill="#475569" font-size="9">${esc(note)}</text>
        <text x="${(x + (bw - 4) / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" fill="#64748b" font-size="8">${n}</text>`;
    })
    .join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Histograma de notas">
    <rect width="100%" height="100%" fill="#f8fafc" stroke="#e2e8f0"/>
    <text x="${pad.l}" y="12" fill="#64748b" font-size="9">Notas mais frequentes (frames F0 válidos)</text>
    ${bars}
  </svg>`;
}

/** Envelope RMS simplificado a partir do pitch_track. */
export function svgRmsEnvelope(report: VoiceCheckF0Report): string {
  const pts = (report.pitch_track ?? []).filter((p) => p.rms != null);
  if (pts.length < 4) {
    return `<p class="muted">Envelope de intensidade indisponível neste relatório (sem RMS nos frames).</p>`;
  }
  const w = 720;
  const h = 100;
  const pad = { l: 36, r: 12, t: 14, b: 22 };
  const t1 = Math.max(report.duration_seconds, 0.01);
  const maxR = Math.max(...pts.map((p) => p.rms ?? 0), 1e-6);
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const xOf = (t: number) => pad.l + (t / t1) * iw;
  const yOf = (r: number) => pad.t + (1 - r / maxR) * ih;
  let d = "";
  pts.forEach((p, i) => {
    const x = xOf(p.time_seconds);
    const y = yOf(p.rms ?? 0);
    d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Envelope RMS">
    <rect width="100%" height="100%" fill="#fff" stroke="#e2e8f0"/>
    <text x="${pad.l}" y="11" fill="#64748b" font-size="9">Intensidade (RMS) ao longo do tempo</text>
    <path d="${d}" fill="none" stroke="#ea580c" stroke-width="1.4"/>
  </svg>`;
}
