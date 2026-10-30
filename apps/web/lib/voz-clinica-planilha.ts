/**
 * VoiceCheck IA 2.0 — histórico do paciente em planilha (CSV para Excel/Google Planilhas),
 * como o "copiar estatísticas para planilhas" do Voice Analyst. Puro e testável.
 * Formato brasileiro: separador ";" e vírgula decimal; BOM UTF-8 para o Excel abrir com acentos.
 */
import {
  ROTULO_TIPO,
  resumoAvaliacao,
  type AnaliseAcustica,
  type AnaliseFala,
  type Avaliacao,
  type ResultadoCepstral,
  type ResultadoDsi,
} from "@/lib/voz-clinica-api";

const COLUNAS = [
  "data", "tipo", "resumo", "f0_media_hz", "f0_dp_semitons", "jitter_pct", "shimmer_pct", "hnr_db", "cpps_db",
  "gne", "mwc", "tmf_s", "f0_fala_mediana_hz", "cpps_frase_db", "avqi", "dsi", "anotacao",
] as const;

function num(v: number | null | undefined, casas = 3): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "" : String(Number(v.toFixed(casas))).replace(".", ",");
}

function celula(v: string): string {
  // aspas quando há separador, aspas ou quebra de linha; "=+-@" no início viram texto (evita fórmula)
  const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function dataLocal(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function historicoCsv(itens: Avaliacao[]): string {
  const linhas = [...itens]
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
    .map((a) => {
      const v: Record<(typeof COLUNAS)[number], string> = Object.fromEntries(COLUNAS.map((c) => [c, ""])) as never;
      v.data = dataLocal(a.criado_em);
      v.tipo = ROTULO_TIPO[a.tipo] ?? a.tipo;
      v.resumo = resumoAvaliacao(a);
      v.anotacao = a.anotacao ?? "";
      if (a.tipo === "acustica") {
        const r = a.resultado as AnaliseAcustica;
        v.f0_media_hz = num(r.f0?.media_hz, 1);
        v.f0_dp_semitons = num(r.f0?.dp_semitons, 2);
        v.jitter_pct = num(r.perturbacao?.jitter_local_pct);
        v.shimmer_pct = num(r.perturbacao?.shimmer_local_pct);
        v.hnr_db = num(r.ruido?.hnr_db, 2);
        v.cpps_db = num(r.cpps_db, 2);
        v.gne = num(r.excitacao?.gne);
        v.mwc = num(r.excitacao?.mwc);
        v.tmf_s = num(r.fonacao?.tmf_s, 1);
      } else if (a.tipo === "fala") {
        v.f0_fala_mediana_hz = num((a.resultado as AnaliseFala).f0?.mediana_hz, 1);
      } else if (a.tipo === "cepstral") {
        const r = a.resultado as ResultadoCepstral;
        v.cpps_db = num(r.vogal?.cpps_db, 2);
        v.cpps_frase_db = num(r.frase?.cpps_db, 2);
        v.avqi = num(r.avqi?.valor, 2);
      } else if (a.tipo === "dsi") {
        v.dsi = num((a.resultado as ResultadoDsi).dsi, 2);
      }
      return COLUNAS.map((c) => celula(v[c])).join(";");
    });
  return "﻿" + [COLUNAS.join(";"), ...linhas].join("\r\n") + "\r\n";
}
