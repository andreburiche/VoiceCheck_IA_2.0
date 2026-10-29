import { describe, expect, it } from "vitest";

import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";
import { prioritizeClusters, dedupeOverlapping } from "@/lib/voicecheck-report-pedagogy";
import { buildVoiceCheckReportHtml } from "@/lib/voicecheck-report";

const baseReport: VoiceCheckF0Report = {
  analysis_version: "voicecheck_tech_v45",
  duration_seconds: 12.5,
  sample_rate: 44100,
  algorithm: "yin_cmndf_v1",
  processing_engine: "python_local",
  parameters: { hop_length: 512 },
  pitch_track: [
    {
      time_seconds: 0,
      frequency_hz: 220,
      midi_note: 57,
      note_name: "A3",
      is_valid: true,
      confidence: 0.8,
      rms: 0.2,
    },
    {
      time_seconds: 1.2,
      frequency_hz: 230,
      midi_note: 57.8,
      note_name: "A3",
      is_valid: true,
      confidence: 0.7,
      rms: 0.18,
    },
  ],
  observed_range: {
    min_hz: 100,
    max_hz: 400,
    median_hz: 220,
    span_semitones: 12,
  },
  statistics: {
    valid_frame_percent: 68.2,
    valid_frames: 100,
    total_frames: 146,
    predominant_hz: 220,
    predominant_note_name: "A3",
    note_histogram: { A3: 40, B3: 12 },
    stable_region_variation_cents_median: 18,
  },
  analyzable_regions: [{ start_seconds: 0, end_seconds: 4 }],
  events: [
    {
      id: "e1",
      category: "unstable_sustained_pitch",
      start_seconds: 1.2,
      end_seconds: 2.4,
      title: "Instabilidade em região sustentada",
      description: "Variação de F0 elevada.",
      guidance: "Pratique sustentação.",
      exercise: "Vogal /a/ por 4s.",
      confidence: 0.7,
      recommendation_key: "stability",
    },
    {
      id: "e2",
      category: "unstable_sustained_pitch",
      start_seconds: 1.3,
      end_seconds: 2.2,
      title: "Instabilidade em região sustentada",
      description: "Sobreposta.",
      confidence: 0.5,
    },
    {
      id: "e3",
      category: "possible_voice_break",
      start_seconds: 5,
      end_seconds: 5.15,
      title: "Possível interrupção da emissão",
      description: "Gap breve.",
      confidence: 0.8,
      recommendation_key: "voice_break",
    },
  ],
  positive_findings: [
    {
      id: "p1",
      key: "no_clipping",
      title: "Sem saturação digital detectada",
      description: "Pico abaixo de 0.95.",
    },
  ],
  recommendations: [
    {
      key: "stability",
      title: "Estabilidade da sustentação",
      text: "Pratique sustentação em volume confortável.",
      exercise: "Sustenido em vogal /a/ ou /u/ por 4s.",
    },
  ],
  warnings: [],
  no_reference: true,
  mode: "without_reference",
  disclaimer: "Análise acústica observável.",
};

describe("voicecheck-report pedagogy", () => {
  it("deduplica ocorrências sobrepostas da mesma categoria", () => {
    const d = dedupeOverlapping(baseReport.events!);
    expect(d.filter((e) => e.category === "unstable_sustained_pitch")).toHaveLength(1);
    expect(d).toHaveLength(2);
  });

  it("prioriza clusters com linguagem acessível", () => {
    const clusters = prioritizeClusters(baseReport.events!);
    expect(clusters[0]?.simpleName).toMatch(/interrupção|oscilações/i);
    expect(clusters.some((c) => c.simpleName.includes("periodicidade"))).toBe(false);
  });
});

describe("voicecheck-report exports", () => {
  it("gera relatório do aluno com 5 páginas e sem jargão cru", () => {
    const html = buildVoiceCheckReportHtml(
      baseReport,
      { studentName: "Músico Teste", assetName: "ensaio.wav", teacherName: "Profa. Ana" },
      "student",
    );
    expect(html).toContain("Minha avaliação vocal");
    expect(html).toContain("Onde preciso melhorar");
    expect(html).toContain("Entendendo minha voz");
    expect(html).toContain("Meu plano de treinamento");
    expect(html).toContain("Minha evolução");
    expect(html).toContain("Músico Teste");
    expect(html).toContain("Profa. Ana");
    expect(html).toContain("Oscilações de altura");
    expect(html).not.toContain("127.0.0.1");
    expect(html).not.toContain("tuning_score");
  });

  it("gera relatório técnico do professor com categorias originais", () => {
    const html = buildVoiceCheckReportHtml(baseReport, { studentName: "Músico Teste" }, "teacher");
    expect(html).toContain("Relatório técnico");
    expect(html).toContain("unstable_sustained_pitch");
    expect(html).toContain("possible_voice_break");
    expect(html).toContain("<svg");
    expect(html).not.toContain("127.0.0.1");
  });

  it("gera PDF completo com anexo", () => {
    const html = buildVoiceCheckReportHtml(baseReport, {}, "complete");
    expect(html).toContain("Minha avaliação vocal");
    expect(html).toContain("Anexo");
    expect(html).toContain("unstable_sustained_pitch");
  });

  it("relatório sem ocorrências permanece honesto", () => {
    const empty: VoiceCheckF0Report = {
      ...baseReport,
      events: [],
      positive_findings: [],
      recommendations: [],
    };
    const html = buildVoiceCheckReportHtml(empty, {}, "student");
    expect(html).toMatch(/evidência suficiente|Nenhuma ocorrência/i);
    expect(html).toContain("Minha evolução");
  });
});
