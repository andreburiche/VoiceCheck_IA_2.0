import { describe, expect, it } from "vitest";

import {
  analysisFingerprint,
  buildDevolutivaFromReport,
  DEVOLUTIVA_VERSION,
} from "@/lib/voicecheck-devolutiva";
import { buildDevolutivaReportHtml } from "@/lib/voicecheck-report-devolutiva";
import { buildTeacherReportHtml } from "@/lib/voicecheck-report-teacher";
import { buildVoiceCheckReportHtml } from "@/lib/voicecheck-report";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";

const report: VoiceCheckF0Report = {
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
    note_histogram: { A3: 40 },
    stable_region_variation_cents_median: 18,
  },
  analyzable_regions: [{ start_seconds: 0, end_seconds: 4 }],
  events: [
    {
      id: "e1",
      category: "unstable_sustained_pitch",
      start_seconds: 1.2,
      end_seconds: 2.4,
      title: "Instabilidade",
      description: "Variação de F0.",
      guidance: "Pratique sustentação.",
      exercise: "Vogal /a/ por 4s.",
      confidence: 0.7,
      recommendation_key: "stability",
    },
    {
      id: "e3",
      category: "possible_voice_break",
      start_seconds: 5,
      end_seconds: 5.15,
      title: "Possível interrupção",
      description: "Gap breve.",
      confidence: 0.8,
      recommendation_key: "voice_break",
    },
  ],
  positive_findings: [
    {
      id: "p1",
      key: "stable_region",
      title: "Trecho estável",
      description: "Região com pouca variação de altura.",
    },
  ],
  recommendations: [
    {
      key: "stability",
      title: "Estabilidade",
      text: "Pratique.",
      exercise: "Sustenido 4s.",
    },
  ],
  mode: "without_reference",
  warnings: [],
  no_reference: true,
  disclaimer: "teste",
};

describe("dois relatórios independentes", () => {
  it("preserva relatório técnico com categorias cruas", () => {
    const html = buildTeacherReportHtml(report, { studentName: "Ana" });
    expect(html).toContain("unstable_sustained_pitch");
    expect(html).toContain("possible_voice_break");
    expect(html).toMatch(/Relatório técnico|Análise técnica|VoiceCheck/i);
  });

  it("gera devolutiva a partir dos mesmos dados reais", () => {
    const d = buildDevolutivaFromReport(report, {
      studentName: "Ana",
      teacherName: "Prof. Lia",
    });
    expect(d.devolutivaVersion).toBe(DEVOLUTIVA_VERSION);
    expect(d.analysisFingerprint).toBe(analysisFingerprint(report));
    expect(d.positives.length).toBeGreaterThanOrEqual(1);
    expect(d.positives[0]?.title).toContain("estável");
    expect(d.priorities.length).toBeGreaterThanOrEqual(1);
    expect(d.priorities.some((p) => /possível/i.test(p.name))).toBe(true);
    expect(d.howIsYourVoice.toLowerCase()).toMatch(/referência|desafina/);
    expect(d.exercises.length).toBeGreaterThanOrEqual(1);
    expect(d.status).toBe("draft");
  });

  it("PDF da devolutiva tem as 5 seções e não inventa afinação absoluta sem ref", () => {
    const d = buildDevolutivaFromReport(report, { studentName: "Ana", teacherName: "Lia" });
    const html = buildDevolutivaReportHtml(d);
    expect(html).toContain("Devolutiva Vocal");
    expect(html).toContain("Como está sua voz");
    expect(html).toContain("pontos positivos");
    expect(html).toContain("precisamos melhorar");
    expect(html).toContain("treino para esta semana");
    expect(html).toContain("Mensagem final");
    expect(html).not.toContain("127.0.0.1");
    expect(html.toLowerCase()).not.toContain("desafinou em relação à melodia esperada");
  });

  it("os dois PDFs podem ser gerados para a mesma gravação", () => {
    const tech = buildTeacherReportHtml(report, { studentName: "Ana" });
    const d = buildDevolutivaFromReport(report, { studentName: "Ana" });
    const ped = buildDevolutivaReportHtml(d);
    expect(tech.length).toBeGreaterThan(500);
    expect(ped.length).toBeGreaterThan(500);
    expect(tech).not.toEqual(ped);
  });

  it("edição da devolutiva não altera o relatório técnico", () => {
    const before = buildTeacherReportHtml(report, { studentName: "Ana" });
    const d = buildDevolutivaFromReport(report, { studentName: "Ana" });
    d.howIsYourVoice = "Texto editado pelo professor.";
    d.closingMessage = "Mensagem custom.";
    const after = buildTeacherReportHtml(report, { studentName: "Ana" });
    expect(after).toBe(before);
    expect(buildDevolutivaReportHtml(d)).toContain("Texto editado pelo professor.");
  });

  it("regenerar com id novo preservinha fingerprint da mesma análise", () => {
    const a = buildDevolutivaFromReport(report, { studentName: "Ana" });
    const b = buildDevolutivaFromReport(report, { studentName: "Ana" });
    expect(a.id).not.toBe(b.id);
    expect(a.analysisFingerprint).toBe(b.analysisFingerprint);
  });

  it("fachada student/teacher/complete continua disponível", () => {
    expect(buildVoiceCheckReportHtml(report, {}, "teacher")).toContain("unstable_sustained_pitch");
    expect(buildVoiceCheckReportHtml(report, {}, "student")).toMatch(/avali|voz|treino/i);
  });
});
