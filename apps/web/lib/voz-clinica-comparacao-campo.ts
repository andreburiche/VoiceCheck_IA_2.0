/**
 * VoiceCheck IA 2.0 — comparação de dois fonetogramas (antes/depois), como a sobreposição
 * de campos vocais do lingWAVES. Puro e testável.
 *
 * Os pontos ficam salvos em dBFS. Se os DOIS fonetogramas foram feitos com o microfone
 * calibrado, cada um é convertido com a própria calibração e a comparação sai em dB SPL;
 * senão, sai em dBFS (válida só com o mesmo microfone, ganho e distância).
 */
import { fixoBR, type Avaliacao, type ResultadoFonetograma } from "@/lib/voz-clinica-api";
import { midiToNoteName } from "@/lib/pitch-math";

export type PontoDb = { midi: number; min_db: number; max_db: number };

/** Fonetogramas com ao menos uma nota, do mais antigo para o mais recente. */
export function fonetogramasEmOrdem(itens: Avaliacao[]): Avaliacao[] {
  return itens
    .filter((a) => a.tipo === "fonetograma" && ((a.resultado as ResultadoFonetograma).pontos?.length ?? 0) > 0)
    .sort((x, y) => x.criado_em.localeCompare(y.criado_em));
}

export type UnidadeComparacao = { unidade: "dB SPL" | "dBFS"; aviso: string | null };

export function unidadeDaComparacao(a: ResultadoFonetograma, b: ResultadoFonetograma): UnidadeComparacao {
  const ca = a.resumo_spl != null && a.calibracao != null;
  const cb = b.resumo_spl != null && b.calibracao != null;
  if (ca && cb) return { unidade: "dB SPL", aviso: null };
  if (ca || cb) {
    return { unidade: "dBFS", aviso: "Só um dos fonetogramas foi feito com o microfone calibrado: a intensidade é comparada em dBFS, o que só vale com o mesmo microfone, ganho e distância." };
  }
  return { unidade: "dBFS", aviso: "Intensidade relativa (dBFS): compare só fonetogramas feitos com o mesmo microfone, ganho e distância. A extensão em semitons vale sempre." };
}

/** Pontos na unidade da comparação (cada fonetograma com a sua própria calibração). */
export function pontosNaUnidade(r: ResultadoFonetograma, unidade: UnidadeComparacao["unidade"]): PontoDb[] {
  const d = unidade === "dB SPL" ? (r.calibracao?.deslocamento_db ?? 0) : 0;
  return [...(r.pontos ?? [])]
    .sort((x, y) => x.midi - y.midi)
    .map((p) => ({ midi: p.midi, min_db: Math.round((p.min_db + d) * 10) / 10, max_db: Math.round((p.max_db + d) * 10) / 10 }));
}

/** Trechos de semitons seguidos (onde falta nota, o contorno se interrompe). */
export function trechosContiguos(pontos: PontoDb[]): PontoDb[][] {
  const trechos: PontoDb[][] = [];
  for (const p of pontos) {
    const atual = trechos.at(-1);
    if (atual && p.midi === atual.at(-1)!.midi + 1) atual.push(p);
    else trechos.push([p]);
  }
  return trechos;
}

function faixaDeNotas(midis: number[]): string {
  if (!midis.length) return "nenhuma";
  const trechos: [number, number][] = [];
  for (const m of [...midis].sort((a, b) => a - b)) {
    const t = trechos.at(-1);
    if (t && m === t[1] + 1) t[1] = m;
    else trechos.push([m, m]);
  }
  return trechos.map(([a, b]) => (a === b ? midiToNoteName(a) : `${midiToNoteName(a)}–${midiToNoteName(b)}`)).join(", ");
}

export type ComparacaoCampo = {
  unidade: UnidadeComparacao["unidade"];
  aviso: string | null;
  linhas: { medida: string; antes: string; depois: string; diferenca: string }[];
  /** Notas alcançadas só depois / só antes. */
  ganhas: string;
  perdidas: string;
  nGanhas: number;
  nPerdidas: number;
};

function linha(medida: string, a: number | null, d: number | null, casas: number, unidade: string) {
  const fmt = (v: number | null) => (v === null ? "—" : `${fixoBR(v, casas)}${unidade ? ` ${unidade}` : ""}`);
  let dif = "—";
  if (a !== null && d !== null) {
    const delta = Number((d - a).toFixed(casas));
    dif = `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${fixoBR(Math.abs(delta), casas)}${unidade ? ` ${unidade}` : ""}`;
  }
  return { medida, antes: fmt(a), depois: fmt(d), diferenca: dif };
}

export function compararCampos(antes: ResultadoFonetograma, depois: ResultadoFonetograma): ComparacaoCampo {
  const u = unidadeDaComparacao(antes, depois);
  const pa = pontosNaUnidade(antes, u.unidade);
  const pd = pontosNaUnidade(depois, u.unidade);
  const resumo = (p: PontoDb[]) => {
    if (!p.length) return { ext: null, notas: 0, fraca: null, forte: null, din: null, area: null };
    const faixas = p.map((x) => x.max_db - x.min_db);
    return {
      ext: p.at(-1)!.midi - p[0]!.midi,
      notas: p.length,
      fraca: Math.min(...p.map((x) => x.min_db)),
      forte: Math.max(...p.map((x) => x.max_db)),
      din: faixas.reduce((s, v) => s + v, 0) / faixas.length,
      area: faixas.reduce((s, v) => s + v, 0),
    };
  };
  const ra = resumo(pa);
  const rd = resumo(pd);
  const ma = new Set(pa.map((p) => p.midi));
  const md = new Set(pd.map((p) => p.midi));
  const ganhas = [...md].filter((m) => !ma.has(m));
  const perdidas = [...ma].filter((m) => !md.has(m));
  const nota = (p: PontoDb[], i: 0 | -1) => (p.length ? midiToNoteName(i === 0 ? p[0]!.midi : p.at(-1)!.midi) : "—");
  return {
    unidade: u.unidade,
    aviso: u.aviso,
    linhas: [
      { medida: "Nota mais grave", antes: nota(pa, 0), depois: nota(pd, 0), diferenca: "" },
      { medida: "Nota mais aguda", antes: nota(pa, -1), depois: nota(pd, -1), diferenca: "" },
      linha("Extensão", ra.ext, rd.ext, 0, "st"),
      linha("Notas alcançadas", ra.notas, rd.notas, 0, ""),
      linha("Voz mais fraca", ra.fraca, rd.fraca, 1, u.unidade),
      linha("Voz mais forte", ra.forte, rd.forte, 1, u.unidade),
      linha("Faixa dinâmica média", ra.din, rd.din, 1, "dB"),
      linha("Área do campo", ra.area, rd.area, 0, "st·dB"),
    ],
    ganhas: faixaDeNotas(ganhas),
    perdidas: faixaDeNotas(perdidas),
    nGanhas: ganhas.length,
    nPerdidas: perdidas.length,
  };
}
