/** VoiceCheck IA 2.0 — cliente das rotas /api/v1/voz-clinica. */
import { apiFetch } from "@/lib/api";
import type { Anamnese } from "@/lib/voz-clinica-anamnese";
import { resumoAnamnese } from "@/lib/voz-clinica-anamnese";
import type { ResumoBiofeedback } from "@/lib/voz-clinica-biofeedback";
import type { PontoCampo, ResumoCampo } from "@/lib/voz-clinica-fonetograma";
import { JOGOS, type ResultadoJogo } from "@/lib/voz-clinica-jogos";
import { resumoPratica, type ExercicioPratica, type ResultadoPratica } from "@/lib/voz-clinica-pratica";


export type TipoAvaliacao = "acustica" | "idv10" | "qvv" | "grbasi" | "easebr" | "anamnese" | "biofeedback" | "jogo" | "fonetograma" | "pratica";
export type Protocolo = "idv10" | "qvv" | "grbasi" | "easebr";

/** Resumo de sessão de biofeedback salvo (medido no navegador). */
export type ResultadoBiofeedback = ResumoBiofeedback & { fonte: "navegador" };

/** Resultado de partida salvo (medido no navegador). */
export type ResultadoJogoSalvo = ResultadoJogo & { fonte: "navegador" };

/** Fonetograma salvo: pontos do navegador, resumo recalculado no servidor. */
export type ResultadoFonetograma = {
  duracao_s: number;
  pontos: Pick<PontoCampo, "midi" | "min_db" | "max_db" | "tempo_s">[];
  resumo: ResumoCampo;
  unidade_intensidade: "dBFS";
  fonte: "navegador";
};

export type AnaliseAcustica = {
  motor: "praat" | "interno";
  versao_praat?: string;
  duracao_s: number;
  f0?: {
    media_hz: number;
    mediana_hz: number;
    dp_hz: number;
    min_hz: number;
    max_hz: number;
    dp_semitons: number;
    faixa_semitons: number;
  };
  intensidade?: { media_dbfs: number | null; min_dbfs: number | null; max_dbfs: number | null };
  perturbacao?: {
    jitter_local_pct?: number | null;
    jitter_rap_pct?: number | null;
    jitter_ppq5_pct?: number | null;
    shimmer_local_pct?: number | null;
    shimmer_local_db?: number | null;
    shimmer_apq3_pct?: number | null;
    shimmer_apq5_pct?: number | null;
    ciclos?: number;
  };
  ruido?: { hnr_db: number | null };
  cpps_db?: number | null;
  formantes?: { f1_hz: number | null; f2_hz: number | null; f3_hz: number | null };
  fonacao?: { tmf_s: number; fracao_surdos_pct: number; quebras_de_voz: number };
  avisos: string[];
};

export type ResultadoIdv10 = {
  protocolo: "IDV-10";
  total: number;
  maximo: number;
  acima_do_corte: boolean;
  corte: number;
};

export type ResultadoQvv = {
  protocolo: "QVV";
  total: number;
  fisico: number;
  socioemocional: number;
  abaixo_do_corte: boolean;
  corte_total: number;
  itens_com_problema: number[];
};

export type ResultadoGrbasi = {
  protocolo: "GRBASI";
  registro: string;
  parametros: Record<string, { nome: string; nota: number; nivel: string }>;
};

export type ResultadoEaseBr = {
  protocolo: "EASE-BR";
  total: number;
  maximo: number;
  itens_positivos: number[];
  itens_com_queixa: number[];
};

export type ResultadoProtocolo = ResultadoIdv10 | ResultadoQvv | ResultadoGrbasi | ResultadoEaseBr;

export type Salvo<T> = { avaliacao_id: string | null; resultado: T };

export type Avaliacao = {
  id: string;
  paciente: string;
  tipo: TipoAvaliacao;
  motor: string | null;
  resultado: AnaliseAcustica | ResultadoProtocolo | Anamnese | ResultadoPratica | ResultadoBiofeedback | ResultadoJogoSalvo | ResultadoFonetograma;
  criado_em: string;
};

export type PacienteResumo = { paciente: string; avaliacoes: number; ultima: string };

const BASE = "/api/v1/voz-clinica";

export function statusVozClinica() {
  return apiFetch<{ motores: string[]; protocolos: string[] }>(`${BASE}/status`);
}

export function analisarGravacao(
  wav: Blob,
  opcoes: { f0Min: number; f0Max: number; paciente?: string | null },
) {
  const dados = new FormData();
  dados.append("file", wav, "gravacao.wav");
  dados.append("f0_min", String(opcoes.f0Min));
  dados.append("f0_max", String(opcoes.f0Max));
  if (opcoes.paciente) dados.append("paciente", opcoes.paciente);
  return apiFetch<Salvo<AnaliseAcustica>>(`${BASE}/analisar`, {
    method: "POST",
    body: dados,
    timeoutMs: 90_000,
  });
}

export function calcularProtocolo(
  nome: Protocolo,
  respostas: number[] | Record<string, number>,
  paciente?: string | null,
) {
  return apiFetch<Salvo<ResultadoProtocolo>>(`${BASE}/protocolos/${nome}`, {
    method: "POST",
    json: { respostas, paciente: paciente || null },
  });
}

export function salvarAnamnese(paciente: string, anamnese: Anamnese) {
  return apiFetch<Salvo<Anamnese>>(`${BASE}/anamnese`, {
    method: "POST",
    json: { paciente, ...anamnese },
  });
}

export type PlanoPratica = {
  id: string;
  paciente: string;
  saudacao: string;
  exercicios: ExercicioPratica[];
  criado_em: string;
  expira_em: string;
  revogado_em: string | null;
  ativo: boolean;
  sessoes: number;
  ultima_sessao: string | null;
};

export function criarPlanoPratica(entrada: { paciente: string; saudacao: string; exercicios: ExercicioPratica[]; validade_dias: number }) {
  return apiFetch<PlanoPratica & { token: string }>(`${BASE}/pratica`, { method: "POST", json: entrada });
}

export function listarPlanosPratica(paciente: string) {
  return apiFetch<{ items: PlanoPratica[] }>(`${BASE}/pratica?paciente=${encodeURIComponent(paciente)}`);
}

export function revogarPlanoPratica(id: string) {
  return apiFetch<PlanoPratica>(`${BASE}/pratica/${encodeURIComponent(id)}/revogar`, { method: "POST" });
}

export function salvarBiofeedback(paciente: string, resumo: ResumoBiofeedback) {
  return apiFetch<Salvo<ResultadoBiofeedback>>(`${BASE}/biofeedback`, {
    method: "POST",
    json: { paciente, ...resumo },
  });
}

export function salvarJogo(paciente: string, resultado: ResultadoJogo) {
  return apiFetch<Salvo<ResultadoJogoSalvo>>(`${BASE}/jogos`, {
    method: "POST",
    json: { paciente, ...resultado },
  });
}

export function salvarFonetograma(paciente: string, duracao_s: number, pontos: PontoCampo[]) {
  return apiFetch<Salvo<ResultadoFonetograma>>(`${BASE}/fonetograma`, {
    method: "POST",
    json: { paciente, duracao_s, pontos: pontos.map(({ midi, min_db, max_db, tempo_s }) => ({ midi, min_db, max_db, tempo_s })) },
  });
}

export function listarPacientes() {
  return apiFetch<{ items: PacienteResumo[] }>(`${BASE}/pacientes`);
}

export function listarAvaliacoes(paciente: string) {
  return apiFetch<{ items: Avaliacao[] }>(`${BASE}/avaliacoes?paciente=${encodeURIComponent(paciente)}`);
}

export function excluirAvaliacao(id: string) {
  return apiFetch<void>(`${BASE}/avaliacoes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Apresentação (pura, testável)
// ---------------------------------------------------------------------------

export const FAIXAS_F0 = {
  feminina: { f0Min: 100, f0Max: 600, rotulo: "Feminina ou infantil (100–600 Hz)" },
  masculina: { f0Min: 75, f0Max: 300, rotulo: "Masculina (75–300 Hz)" },
} as const;

export function numeroBR(valor: number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: 0 });
}

/** Casas decimais fixas ("3,90", "65,0"): medidas lado a lado sempre com o mesmo formato. */
export function fixoBR(valor: number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Linhas da tabela de resultados acústicos: [medida, valor formatado]. */
export function linhasAcusticas(r: AnaliseAcustica): [string, string][] {
  if (!r.f0) return [];
  const p = r.perturbacao ?? {};
  const comUnidade = (v: number | null | undefined, casas: number, unidade: string) =>
    fixoBR(v, casas) === "—" ? "—" : `${fixoBR(v, casas)} ${unidade}`;
  return [
    ["F0 média", comUnidade(r.f0.media_hz, 1, "Hz")],
    ["Variação da F0 (desvio-padrão)", comUnidade(r.f0.dp_semitons, 2, "semitons")],
    ["Jitter local", comUnidade(p.jitter_local_pct, 2, "%")],
    ["Shimmer local", comUnidade(p.shimmer_local_pct, 2, "%")],
    ["HNR", comUnidade(r.ruido?.hnr_db, 1, "dB")],
    ["CPPS", comUnidade(r.cpps_db, 1, "dB")],
    [
      "F1 / F2",
      r.formantes?.f1_hz && r.formantes?.f2_hz
        ? `${fixoBR(r.formantes.f1_hz, 0)} / ${fixoBR(r.formantes.f2_hz, 0)} Hz`
        : "—",
    ],
    ["Tempo de fonação", comUnidade(r.fonacao?.tmf_s, 1, "s")],
    ["Quebras de voz", fixoBR(r.fonacao?.quebras_de_voz, 0)],
  ];
}

/** Frase-resumo de um protocolo, para o resultado e o histórico. */
export function resumoProtocolo(r: ResultadoProtocolo): string {
  if (r.protocolo === "IDV-10") {
    return `${r.total} de ${r.maximo} pontos — ${r.acima_do_corte ? "acima" : "dentro"} da nota de corte (${numeroBR(r.corte, 1)})`;
  }
  if (r.protocolo === "QVV") {
    return (
      `Total ${fixoBR(r.total, 1)} · físico ${fixoBR(r.fisico, 1)} · socioemocional ${fixoBR(r.socioemocional, 1)}` +
      ` — ${r.abaixo_do_corte ? "abaixo" : "acima"} da nota de corte (${numeroBR(r.corte_total, 2)})`
    );
  }
  if (r.protocolo === "EASE-BR") {
    const n = r.itens_com_queixa?.length ?? 0;
    return `${r.total} de ${r.maximo} pontos — ${n === 0 ? "nenhum item" : n === 1 ? "1 item" : `${n} itens`} com 2 ou 3 pontos`;
  }
  return `Registro ${r.registro}`;
}

/** Resumo de uma avaliação salva (histórico do paciente). */
export function resumoAvaliacao(a: Avaliacao): string {
  if (a.tipo === "pratica") return resumoPratica(a.resultado as ResultadoPratica);
  if (a.tipo === "anamnese") return resumoAnamnese(a.resultado as Anamnese);
  if (a.tipo === "fonetograma") {
    const r = (a.resultado as ResultadoFonetograma).resumo;
    if (!r?.nota_grave) return "Sem notas registradas";
    return `${r.nota_grave}–${r.nota_aguda} (${fixoBR(r.hz_grave, 0)}–${fixoBR(r.hz_agudo, 0)} Hz) · ${r.extensao_st} semitons · faixa dinâmica média ${fixoBR(r.faixa_dinamica_media_db, 1)} dB`;
  }
  if (a.tipo === "jogo") {
    const r = a.resultado as ResultadoJogoSalvo;
    const d = r.detalhes ?? {};
    const extra =
      r.jogo === "sopro" ? ` · melhor ${fixoBR(d.melhor_s, 1)} s de ${fixoBR(d.meta_s, 0)} s`
      : r.jogo === "surdo-sonoro" ? ` · ${fixoBR(d.acertos, 0)} de ${fixoBR(d.desafios, 0)} acertos`
      : " no alvo";
    return `${JOGOS[r.jogo]?.titulo ?? r.jogo}: ${fixoBR(r.pontuacao_pct, 1)}%${extra}`;
  }
  if (a.tipo === "biofeedback") {
    const r = a.resultado as ResultadoBiofeedback;
    return [
      `${fixoBR(r.fonacao_s, 1)} s com voz`,
      `pitch na faixa ${fixoBR(r.dentro_pitch_pct, 1)}%`,
      `volume na faixa ${fixoBR(r.dentro_volume_pct, 1)}%`,
      `alvo ${fixoBR(r.alvo_pitch_hz.min, 0)}–${fixoBR(r.alvo_pitch_hz.max, 0)} Hz`,
    ].join(" · ");
  }
  if (a.tipo === "acustica") {
    const r = a.resultado as AnaliseAcustica;
    const p = r.perturbacao ?? {};
    return [
      `F0 ${fixoBR(r.f0?.media_hz, 1)} Hz`,
      `jitter ${fixoBR(p.jitter_local_pct, 2)}%`,
      `shimmer ${fixoBR(p.shimmer_local_pct, 2)}%`,
      `CPPS ${fixoBR(r.cpps_db, 1)} dB`,
    ].join(" · ");
  }
  return resumoProtocolo(a.resultado as ResultadoProtocolo);
}

export const ROTULO_TIPO: Record<TipoAvaliacao, string> = {
  acustica: "Análise acústica",
  biofeedback: "Biofeedback",
  jogo: "Jogo",
  fonetograma: "Fonetograma",
  idv10: "IDV-10",
  qvv: "QVV",
  grbasi: "GRBASI",
  easebr: "EASE-BR",
  anamnese: "Anamnese",
  pratica: "Prática em casa",
};
