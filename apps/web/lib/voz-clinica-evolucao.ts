/**
 * VoiceCheck IA 2.0 — séries de evolução do paciente (pura, testável).
 * Uma série por medida; cada uma vira um gráfico próprio (escalas diferentes
 * nunca dividem o mesmo eixo).
 */
import type { AnaliseAcustica, Avaliacao, ResultadoBiofeedback, ResultadoGrbasi, ResultadoIdv10, ResultadoQvv } from "@/lib/voz-clinica-api";

export type PontoEvolucao = { data: string; valor: number };

export type SerieEvolucao = {
  chave: string;
  titulo: string;
  unidade: string;
  casas: number;
  /** Como ler a direção da curva (texto curto, sem julgar). */
  leitura: string;
  /** Domínio fixo do instrumento; null = calculado pelos dados. */
  dominio: [number, number] | null;
  /** Nota de corte publicada, desenhada como linha de referência. */
  corte?: { valor: number; rotulo: string };
  pontos: PontoEvolucao[];
};

type Extrator = {
  chave: string;
  titulo: string;
  unidade: string;
  casas: number;
  leitura: string;
  dominio: [number, number] | null;
  corte?: { valor: number; rotulo: string };
  tipo: Avaliacao["tipo"];
  valor: (a: Avaliacao) => number | null | undefined;
};

const acustica = (a: Avaliacao) => a.resultado as AnaliseAcustica;

const EXTRATORES: Extrator[] = [
  {
    chave: "jitter", titulo: "Jitter local", unidade: "%", casas: 2, tipo: "acustica", dominio: null,
    leitura: "Variação de um ciclo para o outro; valores menores indicam emissão mais regular.",
    valor: (a) => acustica(a).perturbacao?.jitter_local_pct,
  },
  {
    chave: "shimmer", titulo: "Shimmer local", unidade: "%", casas: 2, tipo: "acustica", dominio: null,
    leitura: "Variação de amplitude entre ciclos; valores menores indicam emissão mais regular.",
    valor: (a) => acustica(a).perturbacao?.shimmer_local_pct,
  },
  {
    chave: "hnr", titulo: "HNR", unidade: "dB", casas: 1, tipo: "acustica", dominio: null,
    leitura: "Proporção harmônico-ruído; valores maiores indicam menos ruído na voz.",
    valor: (a) => acustica(a).ruido?.hnr_db,
  },
  {
    chave: "cpps", titulo: "CPPS", unidade: "dB", casas: 1, tipo: "acustica", dominio: null,
    leitura: "Proeminência do pico cepstral; valores maiores indicam voz mais periódica.",
    valor: (a) => acustica(a).cpps_db,
  },
  {
    chave: "idv10", titulo: "IDV-10", unidade: "pts", casas: 0, tipo: "idv10", dominio: [0, 40],
    corte: { valor: 7.5, rotulo: "corte 7,5" },
    leitura: "Desvantagem vocal percebida pelo paciente; valores menores indicam menos impacto.",
    valor: (a) => (a.resultado as ResultadoIdv10).total,
  },
  {
    chave: "qvv", titulo: "QVV total", unidade: "pts", casas: 1, tipo: "qvv", dominio: [0, 100],
    corte: { valor: 91.25, rotulo: "corte 91,25" },
    leitura: "Qualidade de vida em voz; valores maiores indicam menos impacto.",
    valor: (a) => (a.resultado as ResultadoQvv).total,
  },
  {
    chave: "grbasi_g", titulo: "GRBASI — grau geral (G)", unidade: "", casas: 0, tipo: "grbasi", dominio: [0, 3],
    leitura: "0 normal, 1 leve, 2 moderado, 3 intenso.",
    valor: (a) => (a.resultado as ResultadoGrbasi).parametros?.G?.nota,
  },
  {
    chave: "bio_pitch", titulo: "Biofeedback — pitch na faixa", unidade: "%", casas: 1, tipo: "biofeedback", dominio: [0, 100],
    leitura: "Parte do tempo com voz dentro da faixa de pitch definida em cada sessão (as faixas podem mudar entre sessões).",
    valor: (a) => (a.resultado as ResultadoBiofeedback).dentro_pitch_pct,
  },
];

/** Máximo de pontos por gráfico (as sessões mais recentes). */
export const MAX_PONTOS = 12;

/** Séries com pelo menos 2 medições, em ordem cronológica. */
export function seriesEvolucao(avaliacoes: Avaliacao[]): SerieEvolucao[] {
  const ordenadas = [...avaliacoes].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const saida: SerieEvolucao[] = [];
  for (const { tipo, valor, ...meta } of EXTRATORES) {
    const pontos = ordenadas
      .filter((a) => a.tipo === tipo)
      .map((a) => ({ data: a.criado_em, valor: valor(a) }))
      .filter((p): p is PontoEvolucao => typeof p.valor === "number" && Number.isFinite(p.valor))
      .slice(-MAX_PONTOS);
    if (pontos.length >= 2) saida.push({ ...meta, pontos });
  }
  return saida;
}

/** Passo "redondo" (1, 2, 2,5 ou 5 × 10^n) para cerca de `marcas` intervalos. */
function passoRedondo(amplitude: number, marcas: number): number {
  const bruto = amplitude / marcas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fracao = bruto / potencia;
  // arredonda para o passo redondo mais próximo (não sempre para cima): 4 a 6 marcas
  const fator = fracao < 1.5 ? 1 : fracao < 2.25 ? 2 : fracao < 3.5 ? 2.5 : fracao < 7.5 ? 5 : 10;
  return fator * potencia;
}

/** Medidas inteiras (escores, notas) não ganham marcas fracionárias. */
function passoDaSerie(serie: SerieEvolucao, amplitude: number): number {
  const passo = passoRedondo(amplitude, 4);
  return serie.casas === 0 ? Math.max(1, Math.round(passo)) : passo;
}

/** Escala do eixo Y: domínio fixo do instrumento ou 0 até um teto redondo acima dos dados. */
export function escalaY(serie: SerieEvolucao): { min: number; max: number; marcas: number[] } {
  if (serie.dominio) {
    const [min, max] = serie.dominio;
    const passo = passoDaSerie(serie, max - min);
    return { min, max, marcas: marcasEntre(min, max, passo) };
  }
  const maior = Math.max(...serie.pontos.map((p) => p.valor), serie.corte?.valor ?? 0);
  if (maior <= 0) return { min: 0, max: 1, marcas: [0, 0.5, 1] };
  const passo = passoDaSerie(serie, maior * 1.15);
  const max = Math.ceil((maior * 1.15) / passo) * passo;
  return { min: 0, max, marcas: marcasEntre(0, max, passo) };
}

function marcasEntre(min: number, max: number, passo: number): number[] {
  const marcas: number[] = [];
  for (let v = min; v <= max + passo / 1000; v += passo) marcas.push(Math.round(v * 1000) / 1000);
  return marcas;
}

/** Rótulo curto de data (dd/mm) para o eixo X. */
export function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Variação entre a primeira e a última medição, já formatada (ex.: "−0,42 % desde 03/10"). */
export function variacaoTexto(serie: SerieEvolucao): string {
  const primeiro = serie.pontos[0];
  const ultimo = serie.pontos[serie.pontos.length - 1];
  if (!primeiro || !ultimo) return "";
  const delta = ultimo.valor - primeiro.valor;
  const fator = 10 ** serie.casas;
  const arredondado = Math.round(delta * fator) / fator;
  if (arredondado === 0) return `sem variação desde ${dataCurta(primeiro.data)}`;
  const sinal = arredondado > 0 ? "+" : "−";
  const numero = Math.abs(arredondado).toLocaleString("pt-BR", {
    minimumFractionDigits: serie.casas,
    maximumFractionDigits: serie.casas,
  });
  return `${sinal}${numero}${serie.unidade ? ` ${serie.unidade}` : ""} desde ${dataCurta(primeiro.data)}`;
}
