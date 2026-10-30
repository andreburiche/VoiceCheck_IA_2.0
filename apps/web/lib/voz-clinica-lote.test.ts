import { describe, expect, it } from "vitest";

import type { ItemLote } from "@/lib/voz-clinica-api";
import { csvLote, linhasLote } from "@/lib/voz-clinica-lote";

const ITENS = [
  { arquivo: "ana_pre.wav", ok: true, resultado: { motor: "praat", duracao_s: 3.2, f0: { media_hz: 210.44, dp_semitons: 0.31 },
    perturbacao: { jitter_local_pct: 0.4123, shimmer_local_pct: 2.5 }, ruido: { hnr_db: 21.456 }, cpps_db: 13.2,
    excitacao: { gne: 0.951 }, formantes: { f1_hz: 712.4, f2_hz: 1188 } } },
  { arquivo: "=perigo.wav", ok: false, erro: "não é WAV" },
] as unknown as ItemLote[];

describe("análise em lote", () => {
  it("uma linha por arquivo, vírgula decimal, erro na própria linha", () => {
    const l = linhasLote(ITENS);
    expect(l[0]).toMatchObject({ motor: "Praat", f0_media_hz: "210,4", jitter_pct: "0,412", hnr_db: "21,46", gne: "0,951", f1_hz: "712" });
    expect(l[1]).toMatchObject({ motor: "", f0_media_hz: "", erro: "não é WAV" });
  });

  it("CSV com BOM, ';' e nome de arquivo protegido contra fórmula", () => {
    const csv = csvLote(ITENS);
    expect(csv.startsWith("﻿Arquivo;Motor;Duração (s)")).toBe(true);
    const linhas = csv.trim().split("\r\n");
    expect(linhas[1]!.startsWith("ana_pre.wav;Praat;3,20;210,4")).toBe(true);
    expect(linhas[1]!.includes(";712;1188;")).toBe(true); // sem ponto de milhar
    expect(linhas[2]!.startsWith("'=perigo.wav;;")).toBe(true);
    expect(linhas[2]!.endsWith(";não é WAV")).toBe(true);
  });
});
