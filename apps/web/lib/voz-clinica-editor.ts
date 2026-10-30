/**
 * VoiceCheck IA 2.0 — edição da gravação antes da análise (como a edição de áudio do VoxMetria):
 * selecionar com o mouse, zoom, ouvir o trecho, manter só a seleção, apagar, copiar e colar, desfazer,
 * e marcar trechos com etiquetas exportadas como TextGrid (abre no Praat).
 * Funções puras (testáveis); o desenho e o som ficam no componente.
 */

export type Intervalo = { ini: number; fim: number };

/** Mínimo e máximo do sinal em `n` colunas, dentro da janela [ini, fim) em segundos. */
export function colunasMinMax(amostras: Float32Array, taxa: number, janela: Intervalo, n: number): { min: Float32Array; max: Float32Array } {
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const a0 = Math.max(0, Math.floor(janela.ini * taxa));
  const a1 = Math.min(amostras.length, Math.ceil(janela.fim * taxa));
  const por = (a1 - a0) / n;
  for (let c = 0; c < n; c++) {
    const i0 = Math.floor(a0 + c * por);
    const i1 = Math.max(i0 + 1, Math.floor(a0 + (c + 1) * por));
    let lo = 0;
    let hi = 0;
    for (let i = i0; i < i1 && i < a1; i++) {
      const v = amostras[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[c] = lo;
    max[c] = hi;
  }
  return { min, max };
}

/** Seleção em ordem e dentro da duração; null se ficar menor que `minimo_s`. */
export function normalizarSelecao(a: number, b: number, duracao: number, minimo_s = 0.02): Intervalo | null {
  const ini = Math.max(0, Math.min(a, b, duracao));
  const fim = Math.min(duracao, Math.max(a, b, 0));
  return fim - ini >= minimo_s ? { ini, fim } : null;
}

/** Remove o trecho [ini, fim) (s) e junta o resto, com 5 ms de transição para não estalar. */
export function apagarTrecho(amostras: Float32Array, taxa: number, sel: Intervalo): Float32Array {
  const a = Math.max(0, Math.round(sel.ini * taxa));
  const b = Math.min(amostras.length, Math.round(sel.fim * taxa));
  const saida = new Float32Array(amostras.length - (b - a));
  saida.set(amostras.subarray(0, a), 0);
  saida.set(amostras.subarray(b), a);
  const r = Math.min(Math.round(0.005 * taxa), a, saida.length - a);
  for (let k = 0; k < r; k++) {
    saida[a - r + k]! *= 1 - k / r; // desce antes do corte
    saida[a + k]! *= k / r; // sobe depois
  }
  return saida;
}

/** Rampa de `r` amostras nas duas pontas de um trecho (entra e sai em 5 ms, sem estalo). */
function suavizarPontas(x: Float32Array, r: number): Float32Array {
  const y = x.slice();
  const n = Math.min(r, Math.floor(y.length / 2));
  for (let k = 0; k < n; k++) {
    y[k]! *= k / n;
    y[y.length - 1 - k]! *= k / n;
  }
  return y;
}

/** Cópia das amostras de [ini, fim) (s). */
export function copiarTrecho(amostras: Float32Array, taxa: number, sel: Intervalo): Float32Array {
  const a = Math.max(0, Math.round(sel.ini * taxa));
  const b = Math.min(amostras.length, Math.round(sel.fim * taxa));
  return amostras.slice(a, Math.max(a, b));
}

/**
 * Cola `trecho` no ponto `em` (s) ou no lugar da seleção `em` (substitui o trecho).
 * As emendas descem e sobem em 5 ms para não estalar.
 */
export function colarTrecho(amostras: Float32Array, taxa: number, trecho: Float32Array, em: number | Intervalo): Float32Array {
  const ini = typeof em === "number" ? em : em.ini;
  const fim = typeof em === "number" ? em : em.fim;
  const a = Math.max(0, Math.min(amostras.length, Math.round(ini * taxa)));
  const b = Math.max(a, Math.min(amostras.length, Math.round(fim * taxa)));
  const r = Math.round(0.005 * taxa);
  const antes = amostras.slice(0, a);
  const depois = amostras.slice(b);
  for (let k = 0; k < Math.min(r, antes.length); k++) antes[antes.length - 1 - k]! *= k / Math.min(r, antes.length);
  for (let k = 0; k < Math.min(r, depois.length); k++) depois[k]! *= k / Math.min(r, depois.length);
  const meio = suavizarPontas(trecho, r);
  const saida = new Float32Array(antes.length + meio.length + depois.length);
  saida.set(antes, 0);
  saida.set(meio, antes.length);
  saida.set(depois, antes.length + meio.length);
  return saida;
}

/** Janela de visualização ampliada (fator < 1) ou reduzida (> 1) em torno de `centro`, dentro da duração. */
export function zoom(janela: Intervalo, fator: number, centro: number, duracao: number, minimo_s = 0.05): Intervalo {
  const larg = Math.min(duracao, Math.max(minimo_s, (janela.fim - janela.ini) * fator));
  let ini = centro - larg / 2;
  ini = Math.max(0, Math.min(duracao - larg, ini));
  return { ini, fim: ini + larg };
}

/** Segundos ↔ texto brasileiro ("1,25"). */
export const segTexto = (s: number) => s.toFixed(2).replace(".", ",");
export function textoSeg(t: string): number | null {
  const v = Number(t.trim().replace(",", "."));
  return t.trim() !== "" && Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------
// Marcações (camada de intervalos, como a IntervalTier do TextGrid do Praat)
// ---------------------------------------------------------------------------

export type Marca = Intervalo & { texto: string };

/** Acrescenta a marca em ordem; recusa sobreposição (uma camada de intervalos não se sobrepõe). */
export function adicionarMarca(marcas: Marca[], nova: Marca): { marcas: Marca[] } | { erro: string } {
  const texto = nova.texto.trim();
  if (!texto) return { erro: "Escreva a etiqueta do trecho (ex.: a, pa, frase 1)." };
  if (nova.fim - nova.ini < 0.01) return { erro: "Selecione um trecho antes de marcar." };
  const choque = marcas.find((m) => nova.ini < m.fim - 1e-9 && nova.fim > m.ini + 1e-9);
  if (choque) return { erro: `O trecho se sobrepõe à marca “${choque.texto}”. Ajuste a seleção ou remova a marca.` };
  return { marcas: [...marcas, { ini: nova.ini, fim: nova.fim, texto }].sort((a, b) => a.ini - b.ini) };
}

const num = (v: number) => String(Math.round(v * 1e6) / 1e6);
const aspas = (s: string) => `"${s.replace(/"/g, '""')}"`;

/**
 * TextGrid do Praat (formato texto longo), com uma camada de intervalos que cobre a gravação
 * inteira: os trechos sem marca entram com texto vazio, como o Praat exige.
 */
export function textGrid(duracao: number, marcas: Marca[], camada = "trechos"): string {
  const intervalos: Marca[] = [];
  let t = 0;
  for (const m of [...marcas].sort((a, b) => a.ini - b.ini)) {
    const ini = Math.max(t, Math.min(m.ini, duracao));
    const fim = Math.min(duracao, m.fim);
    if (fim <= ini) continue;
    if (ini > t) intervalos.push({ ini: t, fim: ini, texto: "" });
    intervalos.push({ ini, fim, texto: m.texto });
    t = fim;
  }
  if (t < duracao || !intervalos.length) intervalos.push({ ini: t, fim: duracao, texto: "" });
  const linhas = [
    'File type = "ooTextFile"',
    'Object class = "TextGrid"',
    "",
    "xmin = 0 ",
    `xmax = ${num(duracao)} `,
    "tiers? <exists> ",
    "size = 1 ",
    "item []: ",
    "    item [1]:",
    '        class = "IntervalTier" ',
    `        name = ${aspas(camada)} `,
    "        xmin = 0 ",
    `        xmax = ${num(duracao)} `,
    `        intervals: size = ${intervalos.length} `,
  ];
  intervalos.forEach((iv, i) => {
    linhas.push(`        intervals [${i + 1}]:`, `            xmin = ${num(iv.ini)} `, `            xmax = ${num(iv.fim)} `, `            text = ${aspas(iv.texto)} `);
  });
  return linhas.join("\n") + "\n";
}
