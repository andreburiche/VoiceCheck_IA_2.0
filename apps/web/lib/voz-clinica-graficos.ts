/** VoiceCheck IA 2.0 — cálculos dos gráficos da análise (puro, testável). */

export type BarraHistograma = { de: number; ate: number; n: number; pct: number };
export type HistogramaF0 = { barras: BarraHistograma[]; moda_hz: number | null; media_hz: number | null; quadros: number };

/**
 * Histograma da F0 (como no VoxMetria): frequências mais usadas em barras.
 * Largura da barra: 2 Hz até ~40 Hz de faixa; acima disso, cerca de 30 barras.
 * A moda é o centro da barra mais alta.
 */
export function histogramaF0(f0s: (number | null)[]): HistogramaF0 {
  const v = f0s.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);
  if (!v.length) return { barras: [], moda_hz: null, media_hz: null, quadros: 0 };
  const min = Math.min(...v);
  const max = Math.max(...v);
  const largura = Math.max(2, Math.ceil((max - min) / 30));
  const inicio = Math.floor(min / largura) * largura;
  const n = Math.max(1, Math.ceil((max - inicio + 1e-9) / largura));
  const contagem = new Array<number>(n).fill(0);
  for (const x of v) contagem[Math.min(n - 1, Math.floor((x - inicio) / largura))]! += 1;
  const barras = contagem.map((c, i) => ({ de: inicio + i * largura, ate: inicio + (i + 1) * largura, n: c, pct: (100 * c) / v.length }));
  const maior = barras.reduce((m, b) => (b.n > m.n ? b : m), barras[0]!);
  return {
    barras,
    moda_hz: (maior.de + maior.ate) / 2,
    media_hz: v.reduce((s, x) => s + x, 0) / v.length,
    quadros: v.length,
  };
}

/** Caminho SVG (polilinha) de uma série; null quebra a linha (trecho sem voz). */
export function caminhoSvg(
  valores: (number | null)[],
  largura: number,
  altura: number,
  dominio: [number, number],
  x?: (i: number) => number,
): string {
  const [a, b] = dominio;
  const escalaY = (v: number) => altura - ((v - a) / (b - a || 1)) * altura;
  const escalaX = x ?? ((i: number) => (valores.length <= 1 ? 0 : (i / (valores.length - 1)) * largura));
  let d = "";
  let aberto = false;
  valores.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      aberto = false;
      return;
    }
    d += `${aberto ? "L" : "M"}${escalaX(i).toFixed(1)} ${escalaY(Math.max(a, Math.min(b, v))).toFixed(1)}`;
    aberto = true;
  });
  return d;
}

/** Domínio "bonito" para o eixo: arredonda para múltiplos de passo, com folga. */
export function dominioArredondado(valores: (number | null)[], passo: number, minimoLargura = passo): [number, number] {
  const v = valores.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return [0, passo];
  let a = Math.floor(Math.min(...v) / passo) * passo;
  let b = Math.ceil(Math.max(...v) / passo) * passo;
  if (b - a < minimoLargura) {
    const meio = (a + b) / 2;
    a = Math.floor((meio - minimoLargura / 2) / passo) * passo;
    b = a + Math.ceil(minimoLargura / passo) * passo;
  }
  return [a + 0, b + 0]; // "+ 0" troca -0 por 0
}
