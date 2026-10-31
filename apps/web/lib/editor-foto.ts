/**
 * Contas do editor de foto (sem DOM, testáveis): enquadramento quadrado com zoom, posição,
 * giro de 90° e espelho, e o filtro CSS de cor (brilho, contraste, saturação e estilos).
 */

export type Ajustes = {
  zoom: number; // 1 = a imagem cobre o quadro inteiro
  x: number; // deslocamento do centro, em px do quadro de saída
  y: number;
  giro: 0 | 90 | 180 | 270;
  espelho: boolean;
  brilho: number; // -50..50 (%)
  contraste: number; // -50..50 (%)
  saturacao: number; // -100..100 (%)
  estilo: Estilo;
};

export type Estilo = "normal" | "pb" | "quente" | "frio" | "suave";

export const ESTILOS: { id: Estilo; rotulo: string }[] = [
  { id: "normal", rotulo: "Normal" },
  { id: "pb", rotulo: "Preto e branco" },
  { id: "quente", rotulo: "Quente" },
  { id: "frio", rotulo: "Frio" },
  { id: "suave", rotulo: "Suave" },
];

export const AJUSTES_INICIAIS: Ajustes = {
  zoom: 1, x: 0, y: 0, giro: 0, espelho: false, brilho: 0, contraste: 0, saturacao: 0, estilo: "normal",
};

export const ZOOM_MAX = 4;

/** Largura e altura depois do giro (90° e 270° trocam os lados). */
export function ladosGirados(w: number, h: number, giro: number): [number, number] {
  return giro % 180 === 0 ? [w, h] : [h, w];
}

/** Escala para a imagem cobrir o quadro de lado `quadro` com o zoom pedido. */
export function escalaCobrir(w: number, h: number, giro: number, quadro: number, zoom: number): number {
  const [gw, gh] = ladosGirados(w, h, giro);
  return Math.max(quadro / gw, quadro / gh) * Math.max(1, Math.min(ZOOM_MAX, zoom));
}

/** Limita o deslocamento para a imagem nunca deixar borda vazia no quadro. */
export function limitarPosicao(a: Ajustes, w: number, h: number, quadro: number): Ajustes {
  const [gw, gh] = ladosGirados(w, h, a.giro);
  const e = escalaCobrir(w, h, a.giro, quadro, a.zoom);
  const folgaX = Math.max(0, (gw * e - quadro) / 2);
  const folgaY = Math.max(0, (gh * e - quadro) / 2);
  return { ...a, x: Math.max(-folgaX, Math.min(folgaX, a.x)), y: Math.max(-folgaY, Math.min(folgaY, a.y)) };
}

/** Filtro CSS (canvas `ctx.filter`) com os ajustes de cor e o estilo escolhido. */
export function filtroCss(a: Ajustes): string {
  const partes = [
    `brightness(${(100 + a.brilho) / 100})`,
    `contrast(${(100 + a.contraste) / 100})`,
    `saturate(${Math.max(0, (100 + a.saturacao) / 100)})`,
  ];
  if (a.estilo === "pb") partes.push("grayscale(1)");
  if (a.estilo === "quente") partes.push("sepia(0.25)", "saturate(1.15)");
  if (a.estilo === "frio") partes.push("hue-rotate(-12deg)", "saturate(0.9)");
  if (a.estilo === "suave") partes.push("contrast(0.9)", "brightness(1.06)");
  return partes.join(" ");
}

/** Desenha a imagem ajustada num quadro de `quadro` × `quadro` px (fundo branco). */
export function desenhar(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, a: Ajustes, quadro: number): void {
  const e = escalaCobrir(w, h, a.giro, quadro, a.zoom);
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, quadro, quadro);
  ctx.filter = filtroCss(a);
  ctx.translate(quadro / 2 + a.x, quadro / 2 + a.y);
  ctx.rotate((a.giro * Math.PI) / 180);
  ctx.scale(a.espelho ? -e : e, e);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
