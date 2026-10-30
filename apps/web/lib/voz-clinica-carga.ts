/**
 * VoiceCheck IA 2.0 — teste de carga vocal (como o "Vocal loading test" do lingWAVES), puro e testável.
 *
 * O paciente lê em voz alta, acima da intensidade habitual, por alguns minutos, enquanto o
 * navegador mede intensidade e F0 a cada ~100 ms. O resumo mostra se ele manteve a intensidade
 * pedida e como F0 e intensidade mudaram do começo para o fim (subida da F0 e queda da
 * intensidade com o tempo são sinais comuns de esforço/fadiga).
 * Intensidade em dBFS (relativa ao microfone): use sempre o mesmo microfone e distância.
 */
import { posicaoNaFaixa, type AmostraSessao, type Faixa } from "@/lib/voz-clinica-biofeedback";

export type MinutoCarga = { minuto: number; fonacao_pct: number; f0_mediana_hz: number | null; db_mediano: number | null };

export type ResumoCarga = {
  duracao_s: number;
  duracao_planejada_s: number;
  fonacao_s: number;
  alvo_dbfs: Faixa;
  /** % do tempo com voz dentro da faixa de intensidade pedida. */
  dentro_alvo_pct: number | null;
  /** Medianas no primeiro e no último trecho (20% da sessão, de 15 s a 60 s). */
  f0_inicio_hz: number | null;
  f0_fim_hz: number | null;
  /** Mudança da F0 do início ao fim, em semitons (positivo = subiu). */
  variacao_f0_st: number | null;
  db_inicio: number | null;
  db_fim: number | null;
  variacao_db: number | null;
  minutos: MinutoCarga[];
};

const arred = (v: number | null, casas: number) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** casas) / 10 ** casas);

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const o = v.slice().sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
}

/** Duração de cada amostra = até a próxima (limitada a 0,25 s, para pausas do navegador). */
function comDuracao(amostras: AmostraSessao[]) {
  return amostras.map((a, i) => ({ ...a, dt: Math.max(0, Math.min(0.25, (amostras[i + 1]?.t ?? a.t) - a.t)) }));
}

export function resumirCarga(amostras: AmostraSessao[], alvo: Faixa, duracaoPlanejada_s: number): ResumoCarga {
  const a = comDuracao(amostras);
  const t0 = a[0]?.t ?? 0;
  const duracao = a.length ? a[a.length - 1]!.t - t0 : 0;
  const voz = a.filter((x) => x.hz !== null);
  const fonacao = voz.reduce((s, x) => s + x.dt, 0);
  const dentro = voz.filter((x) => posicaoNaFaixa(x.db, alvo) === "dentro").reduce((s, x) => s + x.dt, 0);

  const borda = Math.min(60, Math.max(15, 0.2 * duracao));
  const ini = voz.filter((x) => x.t - t0 <= borda);
  const fim = voz.filter((x) => x.t - t0 >= duracao - borda);
  const f0i = mediana(ini.map((x) => x.hz as number));
  const f0f = mediana(fim.map((x) => x.hz as number));
  const dbi = mediana(ini.map((x) => x.db));
  const dbf = mediana(fim.map((x) => x.db));
  // se a sessão for curta demais, início e fim se sobrepõem: sem comparação
  const comparavel = duracao >= 2 * borda;

  const minutos: MinutoCarga[] = [];
  for (let m = 0; m * 60 < duracao; m++) {
    const doMin = a.filter((x) => x.t - t0 >= m * 60 && x.t - t0 < (m + 1) * 60);
    const total = doMin.reduce((s, x) => s + x.dt, 0);
    const v = doMin.filter((x) => x.hz !== null);
    minutos.push({
      minuto: m + 1,
      fonacao_pct: arred(total > 0 ? (100 * v.reduce((s, x) => s + x.dt, 0)) / total : 0, 1) ?? 0,
      f0_mediana_hz: arred(mediana(v.map((x) => x.hz as number)), 1),
      db_mediano: arred(mediana(v.map((x) => x.db)), 1),
    });
  }
  return {
    duracao_s: arred(duracao, 1) ?? 0,
    duracao_planejada_s: duracaoPlanejada_s,
    fonacao_s: arred(fonacao, 1) ?? 0,
    alvo_dbfs: alvo,
    dentro_alvo_pct: fonacao > 0 ? arred((100 * dentro) / fonacao, 1) : null,
    f0_inicio_hz: arred(f0i, 1),
    f0_fim_hz: arred(f0f, 1),
    variacao_f0_st: comparavel && f0i && f0f ? arred(12 * Math.log2(f0f / f0i), 2) : null,
    db_inicio: arred(dbi, 1),
    db_fim: arred(dbf, 1),
    variacao_db: comparavel && dbi !== null && dbf !== null ? arred(dbf - dbi, 1) : null,
    minutos,
  };
}

/** Faixa-alvo a partir da voz habitual medida antes: habitual + 6 a +14 dB (fala em voz forte). */
export function alvoDaHabitual(dbHabitual: number): Faixa {
  return { min: Math.round(dbHabitual + 6), max: Math.min(0, Math.round(dbHabitual + 14)) };
}
