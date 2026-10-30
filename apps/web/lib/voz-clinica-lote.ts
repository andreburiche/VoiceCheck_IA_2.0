/**
 * VoiceCheck IA 2.0 — tabela da análise em lote (como a saída de um script do Praat).
 * Puro e testável; a planilha sai no formato brasileiro (";" e vírgula decimal, BOM UTF-8).
 */
import { fixoBR, type ItemLote } from "@/lib/voz-clinica-api";

export const COLUNAS_LOTE = [
  ["arquivo", "Arquivo"], ["motor", "Motor"], ["duracao_s", "Duração (s)"], ["f0_media_hz", "F0 média (Hz)"],
  ["f0_dp_st", "F0 DP (st)"], ["jitter_pct", "Jitter (%)"], ["shimmer_pct", "Shimmer (%)"], ["hnr_db", "HNR (dB)"],
  ["cpps_db", "CPPS (dB)"], ["gne", "GNE"], ["f1_hz", "F1 (Hz)"], ["f2_hz", "F2 (Hz)"], ["erro", "Erro"],
] as const;

export type LinhaLote = Record<(typeof COLUNAS_LOTE)[number][0], string>;

export function linhasLote(itens: ItemLote[]): LinhaLote[] {
  return itens.map((i) => {
    const r = i.resultado;
    const n = (v: number | null | undefined, c: number) => (i.ok && r ? fixoBR(v, c) : "");
    return {
      arquivo: i.arquivo,
      motor: i.ok && r ? (r.motor === "praat" ? "Praat" : "interno") : "",
      duracao_s: n(r?.duracao_s, 2),
      f0_media_hz: n(r?.f0?.media_hz, 1),
      f0_dp_st: n(r?.f0?.dp_semitons, 2),
      jitter_pct: n(r?.perturbacao?.jitter_local_pct, 3),
      shimmer_pct: n(r?.perturbacao?.shimmer_local_pct, 3),
      hnr_db: n(r?.ruido?.hnr_db, 2),
      cpps_db: n(r?.cpps_db, 2),
      gne: n(r?.excitacao?.gne, 3),
      f1_hz: n(r?.formantes?.f1_hz, 0),
      f2_hz: n(r?.formantes?.f2_hz, 0),
      erro: i.ok ? "" : i.erro ?? "falhou",
    };
  });
}

function celula(v: string, texto: boolean): string {
  const s = texto && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v; // texto que começa como fórmula vira texto
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLote(itens: ItemLote[]): string {
  const texto = new Set(["arquivo", "motor", "erro"]);
  const cab = COLUNAS_LOTE.map(([, r]) => r).join(";");
  // nas colunas de número, sem separador de milhar (o "." do pt-BR): "1283" e não "1.283"
  const linhas = linhasLote(itens).map((l) =>
    COLUNAS_LOTE.map(([k]) => celula(texto.has(k) ? l[k] : l[k].replace(/\./g, ""), texto.has(k))).join(";"));
  // "—" (sem valor) vira vazio na planilha
  return "﻿" + [cab, ...linhas].join("\r\n").replace(/(^|;)—(?=;|\r|$)/gm, "$1") + "\r\n";
}
