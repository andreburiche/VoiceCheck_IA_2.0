/** VoiceCheck IA 2.0 — comparação antes/depois de duas análises acústicas (puro, testável). */
import { fixoBR, type AnaliseAcustica, type Avaliacao } from "@/lib/voz-clinica-api";

/** melhor = qual sentido é desejável; neutro = sem sentido clínico único (F0, por exemplo). */
type Sentido = "menor" | "maior" | "neutro";

type Medida = {
  rotulo: string;
  unidade: string;
  casas: number;
  melhor: Sentido;
  /** Diferença abaixo disto conta como "sem mudança" (variação normal entre gravações). */
  tolerancia: number;
  ler: (r: AnaliseAcustica) => number | null | undefined;
};

/**
 * Tolerâncias: ordem de grandeza da variação entre gravações seguidas da mesma voz saudável
 * (jitter ~0,1 p.p., shimmer ~0,5 p.p., HNR e CPPS ~1 dB). Não são limiares diagnósticos:
 * servem só para a tela não chamar de "melhora" uma oscilação esperada.
 */
export const MEDIDAS_COMPARACAO: Medida[] = [
  { rotulo: "F0 média", unidade: "Hz", casas: 1, melhor: "neutro", tolerancia: 5, ler: (r) => r.f0?.media_hz },
  { rotulo: "Variação da F0", unidade: "semitons", casas: 2, melhor: "menor", tolerancia: 0.1, ler: (r) => r.f0?.dp_semitons },
  { rotulo: "Jitter local", unidade: "%", casas: 2, melhor: "menor", tolerancia: 0.1, ler: (r) => r.perturbacao?.jitter_local_pct },
  { rotulo: "Shimmer local", unidade: "%", casas: 2, melhor: "menor", tolerancia: 0.5, ler: (r) => r.perturbacao?.shimmer_local_pct },
  { rotulo: "HNR", unidade: "dB", casas: 1, melhor: "maior", tolerancia: 1, ler: (r) => r.ruido?.hnr_db },
  { rotulo: "CPPS", unidade: "dB", casas: 1, melhor: "maior", tolerancia: 1, ler: (r) => r.cpps_db },
  { rotulo: "GNE", unidade: "", casas: 2, melhor: "maior", tolerancia: 0.03, ler: (r) => r.excitacao?.gne },
  { rotulo: "MWC", unidade: "", casas: 2, melhor: "maior", tolerancia: 0.03, ler: (r) => r.excitacao?.mwc },
  { rotulo: "Tempo de fonação", unidade: "s", casas: 1, melhor: "maior", tolerancia: 1, ler: (r) => r.fonacao?.tmf_s },
  { rotulo: "Quebras de voz", unidade: "", casas: 0, melhor: "menor", tolerancia: 0.5, ler: (r) => r.fonacao?.quebras_de_voz },
];

export type Mudanca = "melhorou" | "piorou" | "sem mudança" | "mudou" | "sem dado";

export type LinhaComparacao = {
  medida: string;
  antes: string;
  depois: string;
  diferenca: string;
  mudanca: Mudanca;
};

function comUnidade(v: number, casas: number, unidade: string): string {
  return unidade ? `${fixoBR(v, casas)} ${unidade}` : fixoBR(v, casas);
}

function valido(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function compararAcusticas(antes: AnaliseAcustica, depois: AnaliseAcustica): LinhaComparacao[] {
  return MEDIDAS_COMPARACAO.map((m) => {
    const a = m.ler(antes);
    const d = m.ler(depois);
    if (!valido(a) || !valido(d)) {
      return {
        medida: m.rotulo,
        antes: valido(a) ? comUnidade(a, m.casas, m.unidade) : "—",
        depois: valido(d) ? comUnidade(d, m.casas, m.unidade) : "—",
        diferenca: "—",
        mudanca: "sem dado",
      };
    }
    const delta = d - a;
    // arredonda como na tela: "+0,00" não pode aparecer como mudança
    const deltaTela = Number(delta.toFixed(m.casas));
    const sinal = deltaTela > 0 ? "+" : deltaTela < 0 ? "−" : "";
    let mudanca: Mudanca;
    if (Math.abs(delta) < m.tolerancia || deltaTela === 0) mudanca = "sem mudança";
    else if (m.melhor === "neutro") mudanca = "mudou";
    else mudanca = (delta < 0) === (m.melhor === "menor") ? "melhorou" : "piorou";
    return {
      medida: m.rotulo,
      antes: comUnidade(a, m.casas, m.unidade),
      depois: comUnidade(d, m.casas, m.unidade),
      diferenca: `${sinal}${comUnidade(Math.abs(deltaTela), m.casas, m.unidade)}`,
      mudanca,
    };
  });
}

/** Análises acústicas do histórico, da mais antiga para a mais recente. */
export function acusticasEmOrdem(itens: Avaliacao[]): Avaliacao[] {
  return itens
    .filter((a) => a.tipo === "acustica" && (a.resultado as AnaliseAcustica).f0)
    .sort((x, y) => x.criado_em.localeCompare(y.criado_em));
}

/** Contagem para o resumo: "3 melhoraram, 1 piorou". */
export function resumoComparacao(linhas: LinhaComparacao[]): string {
  const n = (m: Mudanca) => linhas.filter((l) => l.mudanca === m).length;
  const partes: string[] = [];
  const mel = n("melhorou");
  const pio = n("piorou");
  const igual = n("sem mudança");
  if (mel) partes.push(`${mel} ${mel === 1 ? "medida melhorou" : "medidas melhoraram"}`);
  if (pio) partes.push(`${pio} ${pio === 1 ? "piorou" : "pioraram"}`);
  if (igual) partes.push(`${igual} sem mudança relevante`);
  return partes.join(", ") || "Sem medidas para comparar";
}
