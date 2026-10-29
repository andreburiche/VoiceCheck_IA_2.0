/**
 * VoiceCheck IA 2.0 — prática em casa (pura, testável).
 *
 * Medição de cada repetição no celular, fila de sessões para envio quando houver
 * internet e o link do paciente. O áudio nunca sai do aparelho: só os números
 * de cada repetição são enviados, e o servidor recalcula o resumo.
 */
import { SILENCIO_DBFS, type Faixa } from "@/lib/voz-clinica-biofeedback";

export type TipoExercicio = "sustentar" | "pitch" | "volume";

export type ExercicioPratica = {
  tipo: TipoExercicio;
  titulo: string;
  instrucao?: string;
  repeticoes: number;
  /** pitch/volume: segundos de cada tentativa. */
  duracao_s?: number;
  /** sustentar: meta opcional em segundos. */
  meta_s?: number;
  faixa_hz?: Faixa;
  faixa_db?: Faixa;
};

export type PlanoPublico = { saudacao: string; exercicios: ExercicioPratica[]; expira_em: string };

export const TIPOS_EXERCICIO: Record<TipoExercicio, { nome: string; descricao: string }> = {
  sustentar: { nome: "Vogal sustentada", descricao: "Sustentar uma vogal pelo maior tempo possível, sem forçar." },
  pitch: { nome: "Voz na faixa de altura", descricao: "Manter a voz dentro de uma faixa de frequência (Hz)." },
  volume: { nome: "Volume controlado", descricao: "Manter o volume dentro de uma faixa." },
};

/** Pontos de partida para o profissional ajustar. */
export function exercicioPadrao(tipo: TipoExercicio): ExercicioPratica {
  if (tipo === "sustentar")
    return { tipo, titulo: "Vogal /a/ sustentada", instrucao: "Respire, diga “aaa” num tom confortável e sustente sem forçar.", repeticoes: 3, meta_s: 15 };
  if (tipo === "pitch")
    return { tipo, titulo: "Voz na faixa", instrucao: "Fale ou cante mantendo a voz dentro da faixa destacada.", repeticoes: 3, duracao_s: 10, faixa_hz: { min: 180, max: 260 } };
  return { tipo, titulo: "Volume controlado", instrucao: "Fale em voz média, sem gritar nem sussurrar.", repeticoes: 3, duracao_s: 10, faixa_db: { min: -35, max: -18 } };
}

// ---------------------------------------------------------------------------
// Editor do profissional
// ---------------------------------------------------------------------------

/** Campos numéricos ficam como texto enquanto o profissional digita ("1", "15,5"). */
export type Rascunho = {
  tipo: TipoExercicio;
  titulo: string;
  instrucao: string;
  repeticoes: string;
  duracao_s: string;
  meta_s: string;
  min: string;
  max: string;
};

const br = (v: number | undefined) => (v === undefined ? "" : String(v).replace(".", ","));

export function rascunhoDe(ex: ExercicioPratica): Rascunho {
  const faixa = ex.faixa_hz ?? ex.faixa_db;
  return {
    tipo: ex.tipo, titulo: ex.titulo, instrucao: ex.instrucao ?? "", repeticoes: String(ex.repeticoes),
    duracao_s: br(ex.duracao_s), meta_s: br(ex.meta_s), min: br(faixa?.min), max: br(faixa?.max),
  };
}

/** Rascunho → exercício, ou o texto do primeiro problema encontrado. */
export function exercicioDoRascunho(r: Rascunho, n: number): ExercicioPratica | string {
  const num = (v: string) => (v.trim() === "" ? NaN : Number(v.trim().replace(",", ".")));
  const nome = `Exercício ${n}`;
  if (!r.titulo.trim()) return `${nome}: dê um título.`;
  const reps = num(r.repeticoes);
  if (!Number.isInteger(reps) || reps < 1 || reps > 10) return `${nome}: repetições de 1 a 10.`;
  const ex: ExercicioPratica = { tipo: r.tipo, titulo: r.titulo.trim(), instrucao: r.instrucao.trim(), repeticoes: reps };
  if (r.tipo === "sustentar") {
    if (r.meta_s.trim()) {
      const meta = num(r.meta_s);
      if (!(meta >= 1 && meta <= 60)) return `${nome}: meta de 1 a 60 segundos (ou deixe vazio).`;
      ex.meta_s = meta;
    }
    return ex;
  }
  const dur = num(r.duracao_s);
  if (!(dur >= 3 && dur <= 60)) return `${nome}: duração de cada tentativa de 3 a 60 segundos.`;
  ex.duracao_s = dur;
  const min = num(r.min);
  const max = num(r.max);
  if (r.tipo === "pitch") {
    if (!(min >= 30 && max <= 2000 && min < max)) return `${nome}: faixa em Hz entre 30 e 2000, com o mínimo menor que o máximo.`;
    ex.faixa_hz = { min, max };
  } else {
    if (!(min >= -120 && max <= 0 && min < max)) return `${nome}: faixa em dBFS entre −120 e 0, com o mínimo menor que o máximo.`;
    ex.faixa_db = { min, max };
  }
  return ex;
}

// ---------------------------------------------------------------------------
// Medição de uma repetição
// ---------------------------------------------------------------------------

/** Sustentar: limite de uma repetição e espera máxima pelo início da voz. */
export const SUSTENTAR_MAX_S = 60;
export const ESPERA_INICIO_S = 10;
/** Silêncio que encerra a vogal sustentada. */
const FIM_SILENCIO_S = 0.6;
/** Falha curta que não quebra a vogal sustentada (consoante, respiração curta não contam). */
const TOLERANCIA_FALHA_S = 0.15;
/** Pausa máxima entre leituras: o celular pode travar a aba; não vira "tempo com voz". */
const DT_MAX = 0.25;

export type EstadoRepeticao = {
  t: number | null;
  /** Tempo desde o início (sustentar: desde a primeira voz; pitch/volume: desde o toque em começar). */
  duracao_s: number;
  espera_s: number;
  comecou: boolean;
  /** sustentar: trecho atual e melhor trecho contínuo. */
  atual_s: number;
  melhor_s: number;
  semVoz_s: number;
  /** pitch/volume: tempo com voz, com medida e dentro da faixa. */
  fonacao_s: number;
  medido_s: number;
  dentro_s: number;
  f0: number[];
  fim: boolean;
};

export const estadoRepeticaoInicial = (): EstadoRepeticao => ({
  t: null, duracao_s: 0, espera_s: 0, comecou: false, atual_s: 0, melhor_s: 0, semVoz_s: 0,
  fonacao_s: 0, medido_s: 0, dentro_s: 0, f0: [], fim: false,
});

const dentroDe = (v: number, f: Faixa) => v >= f.min && v <= f.max;

/**
 * Uma leitura do microfone (~60 por segundo). Devolve o estado seguinte; `fim` diz quando a
 * repetição acabou. A lista de F0 é compartilhada entre estados (cresce no lugar, sem cópia).
 */
export function passoRepeticao(e: EstadoRepeticao, ex: ExercicioPratica, t: number, hz: number | null, db: number): EstadoRepeticao {
  if (e.fim) return e;
  const dt = e.t === null ? 0 : Math.min(DT_MAX, Math.max(0, t - e.t));
  const n: EstadoRepeticao = { ...e, t, f0: e.f0 };
  const comSom = db > SILENCIO_DBFS;
  const comVoz = comSom && hz !== null;

  if (ex.tipo === "sustentar") {
    if (!n.comecou) {
      if (!comVoz) {
        n.espera_s += dt;
        if (n.espera_s >= ESPERA_INICIO_S) n.fim = true;
        return n;
      }
      n.comecou = true;
    }
    n.duracao_s += dt;
    if (comVoz) {
      if (hz) n.f0.push(hz);
      n.atual_s += dt + (n.semVoz_s > 0 && n.semVoz_s <= TOLERANCIA_FALHA_S ? n.semVoz_s : 0);
      n.semVoz_s = 0;
    } else {
      n.semVoz_s += dt;
      if (n.semVoz_s > TOLERANCIA_FALHA_S) n.atual_s = 0;
    }
    n.melhor_s = Math.max(n.melhor_s, n.atual_s);
    if (n.semVoz_s >= FIM_SILENCIO_S || n.duracao_s >= SUSTENTAR_MAX_S) n.fim = true;
    return n;
  }

  n.duracao_s += dt;
  if (ex.tipo === "pitch") {
    if (comVoz && hz !== null) {
      n.fonacao_s += dt;
      n.medido_s += dt;
      if (ex.faixa_hz && dentroDe(hz, ex.faixa_hz)) n.dentro_s += dt;
      n.f0.push(hz);
    }
  } else if (comSom) {
    n.fonacao_s += dt;
    n.medido_s += dt;
    if (ex.faixa_db && dentroDe(db, ex.faixa_db)) n.dentro_s += dt;
    if (hz !== null) n.f0.push(hz);
  }
  if (n.duracao_s >= (ex.duracao_s ?? 10)) n.fim = true;
  return n;
}

export type RepeticaoMedida = { duracao_s: number; fonacao_s: number; dentro_pct: number | null; f0_mediana_hz: number | null };

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** O que vai para o servidor (arredondado: 0,1 s, 0,1 %, 0,1 Hz). */
export function resultadoRepeticao(e: EstadoRepeticao, ex: ExercicioPratica): RepeticaoMedida {
  const f0 = mediana(e.f0);
  if (ex.tipo === "sustentar") {
    const fon = r1(e.melhor_s);
    return { duracao_s: Math.max(fon, r1(e.duracao_s)), fonacao_s: fon, dentro_pct: null, f0_mediana_hz: f0 ? r1(f0) : null };
  }
  return {
    duracao_s: r1(e.duracao_s),
    fonacao_s: Math.min(r1(e.fonacao_s), r1(e.duracao_s)),
    dentro_pct: e.medido_s > 0 ? r1((e.dentro_s / e.medido_s) * 100) : null,
    f0_mediana_hz: f0 ? r1(f0) : null,
  };
}

// ---------------------------------------------------------------------------
// Link e estado guardado no celular
// ---------------------------------------------------------------------------

/** O segredo vai depois do "#": o navegador não o envia ao servidor nem a logs. */
export function linkPratica(origem: string, token: string): string {
  return `${origem.replace(/\/$/, "")}/pratica#t=${encodeURIComponent(token)}`;
}

export function tokenDoEndereco(hash: string): string | null {
  const m = /(?:^#|&)t=([A-Za-z0-9_-]{20,128})(?:&|$)/.exec(hash.startsWith("#") ? hash : `#${hash}`);
  return m ? m[1]! : null;
}

/** Link colado pelo paciente (pode vir com texto da mensagem em volta). */
export function tokenDoTexto(texto: string): string | null {
  const m = /\/pratica#(t=[A-Za-z0-9_-]{20,128})/.exec(texto);
  return m ? tokenDoEndereco(`#${m[1]}`) : null;
}

export function mensagemWhatsApp(link: string, saudacao: string): string {
  const oi = saudacao.trim() ? `Olá, ${saudacao.trim()}! ` : "Olá! ";
  return `${oi}Seus exercícios de voz para fazer em casa estão neste link: ${link}\nAbra no celular e toque em “Adicionar à tela inicial” para usar mesmo sem internet. Não compartilhe este link.`;
}

export type SessaoPendente = {
  id: string;
  exercicio: number;
  feito_em: string;
  repeticoes: RepeticaoMedida[];
};

export type FeitaNoCelular = { id: string; exercicio: number; feito_em: string; enviada: boolean };

export type EstadoCelular = {
  token: string;
  plano: PlanoPublico | null;
  fila: SessaoPendente[];
  /** Últimas sessões feitas neste celular (para mostrar o progresso, mesmo offline). */
  feitas: FeitaNoCelular[];
  /** Filas de links anteriores ainda não enviadas (cada uma vai com o próprio token). */
  anteriores: { token: string; fila: SessaoPendente[] }[];
};

const CHAVE = "vc-pratica-v1";
const MAX_FILA = 200;
const MAX_FEITAS = 60;

type Armazem = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function lerEstado(armazem: Armazem): EstadoCelular | null {
  try {
    const bruto = armazem.getItem(CHAVE);
    if (!bruto) return null;
    const e = JSON.parse(bruto) as EstadoCelular;
    if (typeof e?.token !== "string" || !Array.isArray(e.fila)) return null;
    return {
      token: e.token,
      plano: e.plano ?? null,
      fila: e.fila,
      feitas: Array.isArray(e.feitas) ? e.feitas : [],
      anteriores: Array.isArray(e.anteriores) ? e.anteriores.filter((g) => typeof g?.token === "string" && Array.isArray(g.fila)) : [],
    };
  } catch {
    return null;
  }
}

export function salvarEstado(armazem: Armazem, e: EstadoCelular): boolean {
  try {
    armazem.setItem(CHAVE, JSON.stringify(e));
    return true;
  } catch {
    return false; // armazenamento cheio ou bloqueado: a tela avisa
  }
}

export function apagarEstado(armazem: Armazem): void {
  try {
    armazem.removeItem(CHAVE);
  } catch {
    /* nada a fazer */
  }
}

/** Novo link no mesmo celular: troca o plano; a fila do link anterior só é mantida se for o mesmo token. */
/**
 * Novo link no mesmo celular: troca o plano. O que o link anterior ainda não enviou
 * não se perde: vai para `anteriores` e é enviado com o token antigo.
 */
export function estadoParaToken(atual: EstadoCelular | null, token: string): EstadoCelular {
  if (atual && atual.token === token) return atual;
  const anteriores = (atual?.anteriores ?? []).filter((g) => g.token !== token && g.fila.length);
  if (atual?.fila.length) anteriores.push({ token: atual.token, fila: atual.fila });
  const voltando = atual?.anteriores.find((g) => g.token === token);
  return { token, plano: null, fila: voltando?.fila ?? [], feitas: [], anteriores };
}

/** Resposta do envio de uma fila antiga. */
export function aplicarEnvioAnterior(e: EstadoCelular, token: string, recebidas: string[], recusadas: string[]): EstadoCelular {
  const sai = new Set([...recebidas, ...recusadas]);
  return {
    ...e,
    anteriores: e.anteriores
      .map((g) => (g.token === token ? { ...g, fila: g.fila.filter((s) => !sai.has(s.id)) } : g))
      .filter((g) => g.fila.length),
  };
}

/** Link antigo encerrado de vez (revogado ou fora da carência): não há como enviar. */
export function descartarAnterior(e: EstadoCelular, token: string): EstadoCelular {
  return { ...e, anteriores: e.anteriores.filter((g) => g.token !== token) };
}

export function totalPendente(e: EstadoCelular | null): number {
  return e ? e.fila.length + e.anteriores.reduce((n, g) => n + g.fila.length, 0) : 0;
}

export function registrarSessao(e: EstadoCelular, s: SessaoPendente): EstadoCelular {
  return {
    ...e,
    fila: [...e.fila, s].slice(-MAX_FILA),
    feitas: [...e.feitas, { id: s.id, exercicio: s.exercicio, feito_em: s.feito_em, enviada: false }].slice(-MAX_FEITAS),
  };
}

/** Resposta do servidor: o que foi recebido ou recusado sai da fila (reenviar recusada não adianta). */
export function aplicarEnvio(e: EstadoCelular, recebidas: string[], recusadas: string[]): EstadoCelular {
  const sai = new Set([...recebidas, ...recusadas]);
  const ok = new Set(recebidas);
  return {
    ...e,
    fila: e.fila.filter((s) => !sai.has(s.id)),
    feitas: e.feitas.filter((f) => !recusadas.includes(f.id)).map((f) => (ok.has(f.id) ? { ...f, enviada: true } : f)),
  };
}

/** Quantas vezes cada exercício foi feito hoje (no fuso do celular). */
export function feitasHoje(feitas: FeitaNoCelular[], agora: Date): Map<number, number> {
  const hoje = agora.toDateString();
  const m = new Map<number, number>();
  for (const f of feitas) if (new Date(f.feito_em).toDateString() === hoje) m.set(f.exercicio, (m.get(f.exercicio) ?? 0) + 1);
  return m;
}

/** Dias seguidos com pelo menos uma sessão, terminando hoje ou ontem. */
export function diasSeguidos(feitas: FeitaNoCelular[], agora: Date): number {
  const dias = new Set(feitas.map((f) => new Date(f.feito_em).toDateString()));
  const d = new Date(agora);
  if (!dias.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (dias.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Resumo para o histórico do profissional
// ---------------------------------------------------------------------------

export type ResultadoPratica = {
  plano_id: string;
  exercicio: number;
  tipo: TipoExercicio;
  titulo: string;
  faixa_hz?: Faixa | null;
  faixa_db?: Faixa | null;
  repeticoes: RepeticaoMedida[];
  resumo: {
    repeticoes_feitas: number;
    repeticoes_pedidas: number;
    melhor_s?: number;
    media_s?: number;
    meta_s?: number;
    atingiu_meta?: boolean;
    dentro_pct?: number | null;
    fonacao_s?: number;
    f0_mediana_hz?: number | null;
  };
  feito_em: string;
  fonte: "celular";
};

const fx = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Segundos sem casas desnecessárias: 15 → "15", 4,5 → "4,5" (nunca arredonda a meta). */
export const segundos = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function resumoPratica(r: ResultadoPratica): string {
  const s = r.resumo;
  const reps = `${s.repeticoes_feitas} de ${s.repeticoes_pedidas} ${s.repeticoes_pedidas === 1 ? "repetição" : "repetições"}`;
  if (r.tipo === "sustentar") {
    const meta = s.meta_s ? ` · meta ${segundos(s.meta_s)} s ${s.atingiu_meta ? "atingida" : "não atingida"}` : "";
    return `${r.titulo}: melhor ${fx(s.melhor_s)} s · média ${fx(s.media_s)} s · ${reps}${meta}`;
  }
  const faixa =
    r.tipo === "pitch" && r.faixa_hz ? `${fx(r.faixa_hz.min, 0)}–${fx(r.faixa_hz.max, 0)} Hz`
    : r.faixa_db ? `${fx(r.faixa_db.min, 0)} a ${fx(r.faixa_db.max, 0)} dBFS` : "faixa";
  return `${r.titulo}: ${fx(s.dentro_pct)}% na faixa ${faixa} · ${reps}`;
}
