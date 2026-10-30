/**
 * VoiceCheck IA 2.0 — séries de evolução do paciente (pura, testável).
 * Uma série por medida; cada uma vira um gráfico próprio (escalas diferentes
 * nunca dividem o mesmo eixo).
 */
import { ROTULO_DDK, type AnaliseAcustica, type AnaliseFala, type Avaliacao, type ResultadoCepstral, type ResultadoDdk, type ResultadoDsi, type TarefaDdk, type ResultadoBiofeedback, type ResultadoEaseBr, type ResultadoGrbasi, type ResultadoIdv10, type ResultadoFonetograma, type ResultadoJogoSalvo, type ResultadoQvv } from "@/lib/voz-clinica-api";
import { JOGOS, type JogoId } from "@/lib/voz-clinica-jogos";
import type { ResultadoPratica } from "@/lib/voz-clinica-pratica";

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
  /** Filtro extra dentro do tipo (ex.: um jogo específico). */
  filtro?: (a: Avaliacao) => boolean;
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
    chave: "gne", titulo: "GNE", unidade: "", casas: 2, tipo: "acustica", dominio: [0, 1],
    leitura: "Excitação glótica em relação ao ruído (eixo de ruído do GHD); valores maiores indicam menos ruído.",
    valor: (a) => acustica(a).excitacao?.gne,
  },
  {
    chave: "mwc", titulo: "MWC — semelhança entre ciclos", unidade: "", casas: 2, tipo: "acustica", dominio: [0, 1],
    leitura: "Correlação média entre ciclos vizinhos (parte do eixo de irregularidade do GHD); valores maiores indicam ciclos mais regulares.",
    valor: (a) => acustica(a).excitacao?.mwc,
  },
  {
    chave: "fala_f0", titulo: "F0 da fala (mediana)", unidade: "Hz", casas: 0, tipo: "fala", dominio: null,
    leitura: "Altura habitual da voz na fala; a direção desejada depende do objetivo da terapia.",
    valor: (a) => (a.resultado as AnaliseFala).f0?.mediana_hz,
  },
  {
    chave: "fala_faixa", titulo: "F0 da fala — faixa (p5–p95)", unidade: "st", casas: 1, tipo: "fala", dominio: null,
    leitura: "Variação de altura na fala (entonação); faixas muito estreitas soam monótonas.",
    valor: (a) => (a.resultado as AnaliseFala).f0?.faixa_semitons,
  },
  {
    chave: "cep_frase", titulo: "CPPS da frase", unidade: "dB", casas: 1, tipo: "cepstral", dominio: null,
    leitura: "Proeminência cepstral na fala encadeada; valores maiores indicam voz mais periódica.",
    valor: (a) => (a.resultado as ResultadoCepstral).frase?.cpps_db,
  },
  {
    chave: "avqi", titulo: "AVQI", unidade: "", casas: 2, tipo: "cepstral", dominio: null,
    leitura: "Índice acústico de qualidade vocal (0 a 10); valores menores indicam voz menos desviada.",
    valor: (a) => (a.resultado as ResultadoCepstral).avqi?.valor,
  },
  {
    chave: "dsi", titulo: "DSI", unidade: "", casas: 2, tipo: "dsi", dominio: null,
    leitura: "Índice de gravidade da disfonia; valores maiores indicam voz mais próxima do normal (+5).",
    valor: (a) => (a.resultado as ResultadoDsi).dsi,
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
    chave: "pratica_sustentar", titulo: "Prática em casa — vogal sustentada", unidade: "s", casas: 1, tipo: "pratica", dominio: null,
    filtro: (a) => (a.resultado as ResultadoPratica).tipo === "sustentar",
    leitura: "Melhor tempo de cada sessão feita no celular do paciente.",
    valor: (a) => (a.resultado as ResultadoPratica).resumo?.melhor_s,
  },
  {
    chave: "pratica_pitch", titulo: "Prática em casa — altura na faixa", unidade: "%", casas: 1, tipo: "pratica", dominio: [0, 100],
    filtro: (a) => (a.resultado as ResultadoPratica).tipo === "pitch",
    leitura: "Tempo com voz dentro da faixa de altura combinada, em cada sessão feita em casa.",
    valor: (a) => (a.resultado as ResultadoPratica).resumo?.dentro_pct,
  },
  {
    chave: "pratica_volume", titulo: "Prática em casa — volume na faixa", unidade: "%", casas: 1, tipo: "pratica", dominio: [0, 100],
    filtro: (a) => (a.resultado as ResultadoPratica).tipo === "volume",
    leitura: "Tempo com som dentro da faixa de volume combinada, em cada sessão feita em casa.",
    valor: (a) => (a.resultado as ResultadoPratica).resumo?.dentro_pct,
  },
  {
    chave: "easebr", titulo: "EASE-BR", unidade: "pts", casas: 0, tipo: "easebr", dominio: [0, 66],
    leitura: "Fadiga e limitação vocal no canto; valores menores indicam menos queixa. Sem nota de corte publicada.",
    valor: (a) => (a.resultado as ResultadoEaseBr).total,
  },
  {
    chave: "bio_pitch", titulo: "Biofeedback — pitch na faixa", unidade: "%", casas: 1, tipo: "biofeedback", dominio: [0, 100],
    leitura: "Parte do tempo com voz dentro da faixa de pitch definida em cada sessão (as faixas podem mudar entre sessões).",
    valor: (a) => (a.resultado as ResultadoBiofeedback).dentro_pitch_pct,
  },
  {
    chave: "campo_extensao", titulo: "Fonetograma — extensão", unidade: "st", casas: 0, tipo: "fonetograma", dominio: null,
    leitura: "Semitons entre a nota mais grave e a mais aguda sustentadas.",
    valor: (a) => (a.resultado as ResultadoFonetograma).resumo?.extensao_st,
  },
  {
    chave: "campo_dinamica", titulo: "Fonetograma — faixa dinâmica média", unidade: "dB", casas: 1, tipo: "fonetograma", dominio: null,
    leitura: "Diferença média entre a voz mais forte e a mais fraca por nota (relativa: mesmo microfone e distância entre sessões).",
    valor: (a) => (a.resultado as ResultadoFonetograma).resumo?.faixa_dinamica_media_db,
  },
  ...(Object.keys(JOGOS) as JogoId[]).map((jogo): Extrator => ({
    chave: `jogo_${jogo}`,
    titulo: `Jogo — ${JOGOS[jogo].titulo}`,
    unidade: "%",
    casas: 1,
    tipo: "jogo",
    dominio: [0, 100],
    leitura: `Pontuação por partida (${JOGOS[jogo].treina.toLowerCase()}); a dificuldade pode mudar entre partidas.`,
    filtro: (a) => (a.resultado as ResultadoJogoSalvo).jogo === jogo,
    valor: (a) => (a.resultado as ResultadoJogoSalvo).pontuacao_pct,
  })),
  // diadococinesia: uma série por tarefa (/pa/ e /pataka/ têm taxas diferentes)
  ...(Object.keys(ROTULO_DDK) as TarefaDdk[]).flatMap((tarefa): Extrator[] => [
    {
      chave: `ddk_${tarefa}_taxa`, titulo: `Diadococinesia ${ROTULO_DDK[tarefa]} — taxa`, unidade: "síl/s", casas: 1,
      tipo: "ddk", dominio: null, filtro: (a) => (a.resultado as ResultadoDdk).tarefa === tarefa,
      leitura: "Sílabas por segundo na repetição rápida; valores maiores indicam articulação mais ágil.",
      valor: (a) => (a.resultado as ResultadoDdk).taxa_silabas_s,
    },
    {
      chave: `ddk_${tarefa}_cv`, titulo: `Diadococinesia ${ROTULO_DDK[tarefa]} — irregularidade do ritmo`, unidade: "%", casas: 1,
      tipo: "ddk", dominio: null, filtro: (a) => (a.resultado as ResultadoDdk).tarefa === tarefa,
      leitura: "Coeficiente de variação dos intervalos entre sílabas; valores menores indicam ritmo mais regular.",
      valor: (a) => (a.resultado as ResultadoDdk).intervalo_cv_pct,
    },
  ]),
];

/** Máximo de pontos por gráfico (as sessões mais recentes). */
export const MAX_PONTOS = 12;

/** Séries com pelo menos 2 medições, em ordem cronológica. */
export function seriesEvolucao(avaliacoes: Avaliacao[]): SerieEvolucao[] {
  const ordenadas = [...avaliacoes].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const saida: SerieEvolucao[] = [];
  for (const { tipo, valor, filtro, ...meta } of EXTRATORES) {
    const pontos = ordenadas
      .filter((a) => a.tipo === tipo && (!filtro || filtro(a)))
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
