/**
 * VoiceCheck IA 2.0 — jogos de terapia vocal (lógica pura, testável).
 *
 * Quatro jogos sobre o mesmo motor ao vivo do biofeedback:
 * - altitude: o VOLUME controla a altura; seguir os patamares do percurso
 * - trilha:   o PITCH controla a altura; seguir patamares e deslizes
 * - sopro:    sustentar a voz sem parar até a meta de tempo
 * - surdo-sonoro: produzir o par pedido (s/z, f/v, ch/j)
 */
import { nivelDbfs, pitchYin, type Faixa } from "@/lib/voz-clinica-biofeedback";

export type JogoId = "altitude" | "trilha" | "sopro" | "surdo-sonoro";

export const JOGOS: Record<JogoId, { titulo: string; treina: string; instrucao: string }> = {
  altitude: {
    titulo: "Altitude",
    treina: "Controle de intensidade",
    instrucao: "Fale ou sustente uma vogal: quanto mais forte a voz, mais alto o ponto. Mantenha o ponto dentro das faixas.",
  },
  trilha: {
    titulo: "Trilha",
    treina: "Controle de frequência",
    instrucao: "Sustente uma vogal: voz mais aguda sobe o ponto, mais grave desce. Acompanhe a trilha, inclusive nas subidas e descidas.",
  },
  sopro: {
    titulo: "Sopro longo",
    treina: "Tempo de fonação",
    instrucao: "Respire e sustente um “a” confortável, sem parar, até completar a barra.",
  },
  "surdo-sonoro": {
    titulo: "Surdo ou sonoro",
    treina: "Sonorização (s/z, f/v, ch/j)",
    instrucao: "Produza o som pedido na tela e segure por um instante. Sons sonoros vibram na garganta; surdos, não.",
  },
};

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

/** Gerador pseudoaleatório com semente (sessões reproduzíveis). */
export function aleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Valor na faixa → 0..1 (log para pitch: distâncias iguais em semitons). */
export function normalizar(valor: number, faixa: Faixa, escala: "linear" | "log" = "linear"): number {
  const f = (v: number) => (escala === "log" ? Math.log2(Math.max(v, 1e-6)) : v);
  const r = (f(valor) - f(faixa.min)) / (f(faixa.max) - f(faixa.min) || 1);
  return Math.max(0, Math.min(1, r));
}

// ---------------------------------------------------------------------------
// Percurso (altitude e trilha)
// ---------------------------------------------------------------------------

/** Trecho do percurso: o alvo vai de `de` até `ate` (0..1) entre `inicio` e `fim` (s). */
export type Segmento = { inicio: number; fim: number; de: number; ate: number };

/**
 * Altitude: patamares (baixo, médio, alto) com pausas para respirar.
 * Trilha: patamares ligados por deslizes (glissandos).
 */
export function gerarPercurso(jogo: "altitude" | "trilha", duracao_s: number, semente = 1): Segmento[] {
  const rnd = aleatorio(semente);
  const niveis = [0.2, 0.5, 0.8];
  const segs: Segmento[] = [];
  let t = 2; // 2 s para se preparar
  let anterior = niveis[1]!;
  while (t < duracao_s) {
    let nivel = niveis[Math.floor(rnd() * niveis.length)]!;
    if (nivel === anterior) nivel = niveis[(niveis.indexOf(nivel) + 1) % niveis.length]!;
    if (jogo === "trilha" && segs.length) {
      const fim = Math.min(duracao_s, t + 1.5);
      segs.push({ inicio: t, fim, de: anterior, ate: nivel }); // deslize
      t = fim;
    }
    const dur = jogo === "altitude" ? 3 : 2.5;
    const fim = Math.min(duracao_s, t + dur);
    if (fim > t) segs.push({ inicio: t, fim, de: nivel, ate: nivel });
    t = fim + (jogo === "altitude" ? 1.5 : 0); // altitude: pausa para respirar
    anterior = nivel;
  }
  return segs;
}

/** Alvo (0..1) no instante t, ou null em pausa. */
export function alvoEm(percurso: Segmento[], t: number): number | null {
  for (const s of percurso) {
    if (t >= s.inicio && t <= s.fim) {
      const k = s.fim > s.inicio ? (t - s.inicio) / (s.fim - s.inicio) : 0;
      return s.de + (s.ate - s.de) * k;
    }
  }
  return null;
}

export type EstadoPercurso = {
  t: number | null;
  /** Tempo em que havia alvo (a pontuação é sobre ele). */
  comAlvo_s: number;
  noAlvo_s: number;
};

export const estadoPercursoInicial = (): EstadoPercurso => ({ t: null, comAlvo_s: 0, noAlvo_s: 0 });

/** Avança o jogo: `y` é a posição do ponto (0..1) ou null sem voz. */
export function passoPercurso(e: EstadoPercurso, t: number, y: number | null, percurso: Segmento[], tolerancia = 0.12): EstadoPercurso {
  const dt = e.t === null ? 0 : Math.max(0, Math.min(0.25, t - e.t));
  const alvo = alvoEm(percurso, t);
  if (alvo === null) return { ...e, t };
  const acertou = y !== null && Math.abs(y - alvo) <= tolerancia;
  return { t, comAlvo_s: e.comAlvo_s + dt, noAlvo_s: e.noAlvo_s + (acertou ? dt : 0) };
}

export function pontuacaoPercurso(e: EstadoPercurso): number {
  return e.comAlvo_s > 0 ? Math.round((1000 * e.noAlvo_s) / e.comAlvo_s) / 10 : 0;
}

// ---------------------------------------------------------------------------
// Sopro longo
// ---------------------------------------------------------------------------

export type EstadoSopro = { t: number | null; atual_s: number; melhor_s: number; semVoz_s: number };

export const estadoSoproInicial = (): EstadoSopro => ({ t: null, atual_s: 0, melhor_s: 0, semVoz_s: 0 });

/** Pausas menores que `tolerancia_s` (oscilação da leitura) não interrompem a emissão. */
export function passoSopro(e: EstadoSopro, t: number, comVoz: boolean, tolerancia_s = 0.15): EstadoSopro {
  const dt = e.t === null ? 0 : Math.max(0, Math.min(0.25, t - e.t));
  if (comVoz) {
    const atual = e.atual_s + dt + (e.semVoz_s > 0 && e.atual_s > 0 ? e.semVoz_s : 0);
    return { t, atual_s: atual, melhor_s: Math.max(e.melhor_s, atual), semVoz_s: 0 };
  }
  const semVoz = e.semVoz_s + dt;
  if (semVoz <= tolerancia_s) return { ...e, t, semVoz_s: semVoz };
  return { t, atual_s: 0, melhor_s: e.melhor_s, semVoz_s: semVoz };
}

// ---------------------------------------------------------------------------
// Surdo ou sonoro
// ---------------------------------------------------------------------------

export type ClasseSom = "sonoro" | "surdo" | "silencio";

/** Fração de amostras em que o sinal troca de sinal (alta em fricativas surdas). */
export function taxaCruzamentosZero(janela: Float32Array): number {
  let n = 0;
  for (let i = 1; i < janela.length; i++) {
    const a = janela[i - 1] ?? 0;
    const b = janela[i] ?? 0;
    if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) n++;
  }
  return n / Math.max(1, janela.length - 1);
}

/** Parte da energia abaixo de ~400 Hz ("barra de voz" dos sons sonoros). */
export function energiaGrave(janela: Float32Array, taxa: number, corte = 400): number {
  const a = 1 - Math.exp((-2 * Math.PI * corte) / taxa);
  let y = 0;
  let eGrave = 0;
  let eTotal = 0;
  let media = 0;
  for (let i = 0; i < janela.length; i++) media += janela[i] ?? 0;
  media /= Math.max(1, janela.length);
  for (let i = 0; i < janela.length; i++) {
    const x = (janela[i] ?? 0) - media;
    y += a * (x - y);
    eGrave += y * y;
    eTotal += x * x;
  }
  return eTotal > 0 ? eGrave / eTotal : 0;
}

/** Limiar de silêncio do jogo (fricativas surdas são fracas; mais baixo que o da voz). */
export const SILENCIO_FRICATIVA_DBFS = -50;

export function classificarSom(janela: Float32Array, taxa: number): ClasseSom {
  if (nivelDbfs(janela) < SILENCIO_FRICATIVA_DBFS) return "silencio";
  if (pitchYin(janela, taxa, 60, 600) !== null) return "sonoro";
  // /z/, /v/, /j/: vibração mascarada pelo ruído — sobra energia grave
  if (energiaGrave(janela, taxa) > 0.25) return "sonoro";
  return taxaCruzamentosZero(janela) > 0.08 ? "surdo" : "silencio";
}

export const PARES = [
  { surdo: "s", sonoro: "z", exemploSurdo: "sssss (como em “sapo”)", exemploSonoro: "zzzzz (como em “zebra”)" },
  { surdo: "f", sonoro: "v", exemploSurdo: "fffff (como em “faca”)", exemploSonoro: "vvvvv (como em “vaca”)" },
  { surdo: "ch", sonoro: "j", exemploSurdo: "chhhh (como em “chave”)", exemploSonoro: "jjjjj (como em “janela”)" },
] as const;

export type Desafio = { som: string; exemplo: string; esperado: "surdo" | "sonoro" };

export function gerarDesafios(quantidade: number, semente = 1): Desafio[] {
  const rnd = aleatorio(semente);
  return Array.from({ length: quantidade }, () => {
    const par = PARES[Math.floor(rnd() * PARES.length)]!;
    const sonoro = rnd() < 0.5;
    return sonoro
      ? { som: par.sonoro, exemplo: par.exemploSonoro, esperado: "sonoro" as const }
      : { som: par.surdo, exemplo: par.exemploSurdo, esperado: "surdo" as const };
  });
}

export type EstadoDesafios = {
  t: number | null;
  indice: number;
  inicioDesafio: number | null;
  /** Tempo seguido produzindo a classe certa no desafio atual. */
  certo_s: number;
  acertos: number;
  erros: number;
  /** Desafio atual recebeu som da classe errada por tempo suficiente. */
  trocou: boolean;
  /** Resultado de cada desafio (true = acerto). */
  historico: boolean[];
};

export const estadoDesafiosInicial = (): EstadoDesafios => ({
  t: null, indice: 0, inicioDesafio: null, certo_s: 0, acertos: 0, erros: 0, trocou: false, historico: [],
});

export function passoDesafios(
  e: EstadoDesafios,
  t: number,
  classe: ClasseSom,
  desafios: Desafio[],
  opcoes: { segurar_s?: number; limite_s?: number } = {},
): EstadoDesafios {
  const segurar = opcoes.segurar_s ?? 0.6;
  const limite = opcoes.limite_s ?? 5;
  if (e.indice >= desafios.length) return { ...e, t };
  const dt = e.t === null ? 0 : Math.max(0, Math.min(0.25, t - e.t));
  const inicio = e.inicioDesafio ?? t;
  const desafio = desafios[e.indice]!;
  const certo = classe === desafio.esperado ? e.certo_s + dt : 0;
  const errado = classe !== "silencio" && classe !== desafio.esperado;

  const proximo = (acertou: boolean): EstadoDesafios => ({
    t,
    indice: e.indice + 1,
    inicioDesafio: t + 1, // 1 s de intervalo antes do próximo
    certo_s: 0,
    acertos: e.acertos + (acertou ? 1 : 0),
    erros: e.erros + (acertou ? 0 : 1),
    trocou: false,
    historico: [...e.historico, acertou],
  });

  if (t < inicio) return { ...e, t, inicioDesafio: inicio }; // intervalo
  if (certo >= segurar) return proximo(true);
  if (t - inicio >= limite) return proximo(false);
  return { ...e, t, inicioDesafio: inicio, certo_s: certo, trocou: e.trocou || errado };
}

export function pontuacaoDesafios(e: EstadoDesafios): number {
  const total = e.acertos + e.erros;
  return total > 0 ? Math.round((1000 * e.acertos) / total) / 10 : 0;
}

// ---------------------------------------------------------------------------
// Resultado salvo no histórico
// ---------------------------------------------------------------------------

export type ResultadoJogo = {
  jogo: JogoId;
  duracao_s: number;
  pontuacao_pct: number;
  /** Detalhes numéricos do jogo (meta, melhor tempo, acertos…). */
  detalhes: Record<string, number>;
};
