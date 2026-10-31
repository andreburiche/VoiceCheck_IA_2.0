/**
 * VoiceCheck IA 2.0 — diagrama de irregularidade × ruído, inspirado no Diagrama de Desvio
 * Fonatório (DDF, VoxMetria) e no Diagrama de Rouquidão (GHD, lingWAVES).
 *
 * NÃO é o DDF oficial: as constantes do DDF e do GHD não foram publicadas. Aqui os eixos usam
 * só o que está publicado: irregularidade = jitter e shimmer, ruído = GNE, e os limites de
 * normalidade do VoxMetria (jitter até 0,6 %, shimmer até 6,5 %, GNE a partir de 0,5; Revista
 * CEFAC, "Análise de diagramas de desvio fonatório"). Cada eixo vale 1 no limite: abaixo de 1
 * está dentro do limite; na irregularidade vale a medida mais alterada (jitter ou shimmer). Quadrantes como no DDF: inferior esquerdo dentro dos limites,
 * inferior direito irregularidade (tendência a rugosidade), superior direito irregularidade e
 * ruído (tendência a soprosidade), superior esquerdo só ruído.
 */
import type { AnaliseAcustica, Avaliacao } from "@/lib/voz-clinica-api";

export const LIMITES_DDF = { jitter_pct: 0.6, shimmer_pct: 6.5, gne: 0.5 } as const;
/** Até onde os eixos vão no desenho (3 × o limite); valores maiores ficam presos na borda. */
export const MAX_EIXO = 3;

export type Quadrante = "normal" | "irregularidade" | "ruido" | "ambos";

export type PontoDdf = {
  /** Irregularidade: o maior de jitter/0,6 e shimmer/6,5 (1 = no limite; qualquer um acima tira da área normal). */
  x: number;
  /** Ruído: (1 − GNE) / (1 − 0,5) (1 = GNE no limite de 0,5). */
  y: number;
  quadrante: Quadrante;
  jitter: number;
  shimmer: number;
  gne: number;
  criado_em: string;
};

export const ROTULO_QUADRANTE: Record<Quadrante, string> = {
  normal: "dentro dos limites",
  irregularidade: "irregularidade acima do limite (tendência a rugosidade)",
  ruido: "ruído acima do limite",
  ambos: "irregularidade e ruído acima do limite (tendência a soprosidade)",
};

const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function quadrante(x: number, y: number): Quadrante {
  if (x <= 1 && y <= 1) return "normal";
  if (x > 1 && y <= 1) return "irregularidade";
  if (x <= 1) return "ruido";
  return "ambos";
}

/** Posição no diagrama a partir de jitter (%), shimmer (%) e GNE. */
export function xyDdf(j: number, s: number, g: number): { x: number; y: number; quadrante: Quadrante } {
  // o maior, não a média: um jitter alto com shimmer baixo não pode cair "dentro dos limites"
  const x = Math.max(j / LIMITES_DDF.jitter_pct, s / LIMITES_DDF.shimmer_pct);
  const y = Math.max(0, 1 - g) / (1 - LIMITES_DDF.gne);
  return { x, y, quadrante: quadrante(x, y) };
}

export function pontoDdf(r: AnaliseAcustica, criado_em = ""): PontoDdf | null {
  const j = r.perturbacao?.jitter_local_pct;
  const s = r.perturbacao?.shimmer_local_pct;
  const g = r.excitacao?.gne;
  if (!ok(j) || !ok(s) || !ok(g)) return null;
  return { ...xyDdf(j, s, g), jitter: j, shimmer: s, gne: g, criado_em };
}

export type PontoTrecho = PontoDdf & { inicio_s: number; fim_s: number };

/** Nuvem de pontos: um por trecho de 0,5 s (vazia em análises antigas, feitas antes dos trechos). */
export function pontosTrechos(r: AnaliseAcustica): PontoTrecho[] {
  return (r.ddf_segmentos ?? [])
    .filter((t) => ok(t.jitter_pct) && ok(t.shimmer_pct) && ok(t.gne))
    .map((t) => ({ ...xyDdf(t.jitter_pct, t.shimmer_pct, t.gne), jitter: t.jitter_pct, shimmer: t.shimmer_pct, gne: t.gne, criado_em: "", inicio_s: t.inicio_s, fim_s: t.fim_s }));
}

/** Espalhamento da nuvem (desvio-padrão de x e de y); null com menos de 3 trechos. */
export function dispersao(pts: { x: number; y: number }[]): { x: number; y: number } | null {
  if (pts.length < 3) return null;
  const dp = (v: number[]) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  };
  return { x: dp(pts.map((p) => p.x)), y: dp(pts.map((p) => p.y)) };
}

/** Pontos das análises acústicas, da mais antiga para a mais recente. */
export function pontosDdf(itens: Avaliacao[]): PontoDdf[] {
  return itens
    .filter((a) => a.tipo === "acustica")
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
    .map((a) => pontoDdf(a.resultado as AnaliseAcustica, a.criado_em))
    .filter((p): p is PontoDdf => p !== null);
}

/**
 * SVG do diagrama (só números e rótulos fixos: seguro para o relatório e para a tela).
 * `tema` escolhe as cores do relatório impresso (claro) ou da tela (escura).
 */
export function svgDdf(pontos: PontoDdf[], tema: "claro" | "escuro" = "claro", largura = 320): string {
  const c = tema === "claro"
    ? { fundo: "#ffffff", eixo: "#4E6170", grade: "#D6E1E6", normal: "rgba(21,122,74,0.10)", linha: "#0E8F8A", ponto: "#0E8F8A", ultimo: "#B45309", texto: "#0E1A24" }
    : { fundo: "transparent", eixo: "#94A3B8", grade: "rgba(148,163,184,0.25)", normal: "rgba(74,222,154,0.12)", linha: "#20D9D2", ponto: "#20D9D2", ultimo: "#E8B84A", texto: "#E8F0F4" };
  const m = { e: 34, d: 10, t: 10, b: 30 };
  const lado = largura - m.e - m.d;
  const alt = lado + m.t + m.b;
  const X = (v: number) => m.e + (Math.min(v, MAX_EIXO) / MAX_EIXO) * lado;
  const Y = (v: number) => m.t + lado - (Math.min(v, MAX_EIXO) / MAX_EIXO) * lado;
  const partes: string[] = [];
  partes.push(`<rect x="0" y="0" width="${largura}" height="${alt}" fill="${c.fundo}"/>`);
  partes.push(`<rect x="${X(0)}" y="${Y(1)}" width="${X(1) - X(0)}" height="${Y(0) - Y(1)}" fill="${c.normal}"/>`);
  for (let k = 1; k <= MAX_EIXO; k++) {
    partes.push(`<line x1="${X(k)}" y1="${Y(0)}" x2="${X(k)}" y2="${Y(MAX_EIXO)}" stroke="${c.grade}" stroke-width="${k === 1 ? 1.5 : 1}" ${k === 1 ? "" : 'stroke-dasharray="3 3"'}/>`);
    partes.push(`<line x1="${X(0)}" y1="${Y(k)}" x2="${X(MAX_EIXO)}" y2="${Y(k)}" stroke="${c.grade}" stroke-width="${k === 1 ? 1.5 : 1}" ${k === 1 ? "" : 'stroke-dasharray="3 3"'}/>`);
  }
  partes.push(`<rect x="${X(0)}" y="${Y(MAX_EIXO)}" width="${lado}" height="${lado}" fill="none" stroke="${c.eixo}"/>`);
  const fonte = `font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" fill="${c.eixo}"`;
  partes.push(`<text x="${X(MAX_EIXO / 2)}" y="${alt - 8}" text-anchor="middle" ${fonte}>Irregularidade (jitter, shimmer) →</text>`);
  partes.push(`<text x="11" y="${Y(MAX_EIXO / 2)}" text-anchor="middle" transform="rotate(-90 11 ${Y(MAX_EIXO / 2)})" ${fonte}>Ruído (GNE) →</text>`);
  partes.push(`<text x="${X(0.5)}" y="${Y(0.5) + 3}" text-anchor="middle" ${fonte}>limites</text>`);
  partes.push(`<text x="${X(1)}" y="${Y(0) + 12}" text-anchor="middle" ${fonte}>1</text>`);
  partes.push(`<text x="${X(0) - 6}" y="${Y(1) + 3}" text-anchor="end" ${fonte}>1</text>`);
  if (pontos.length > 1) {
    const d = pontos.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
    partes.push(`<path d="${d}" fill="none" stroke="${c.linha}" stroke-width="1.2" stroke-opacity="0.6"/>`);
  }
  pontos.forEach((p, i) => {
    const ultimo = i === pontos.length - 1;
    partes.push(`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${ultimo ? 5 : 3.5}" fill="${ultimo ? c.ultimo : c.ponto}"/>`);
    if (pontos.length <= 12) {
      partes.push(`<text x="${(X(p.x) + 6).toFixed(1)}" y="${(Y(p.y) - 5).toFixed(1)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" fill="${c.texto}">${i + 1}</text>`);
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${alt}" width="${largura}" height="${alt}" role="img">${partes.join("")}</svg>`;
}
