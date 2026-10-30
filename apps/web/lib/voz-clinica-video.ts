/**
 * VoiceCheck IA 2.0 — revisão de vídeo laríngeo (câmera lenta, quadro a quadro, captura),
 * como o módulo de vídeo do lingWAVES. Puro e testável; o vídeo em si é do equipamento.
 */

/** Velocidades oferecidas (o Chrome aceita a partir de 1/16). */
export const VELOCIDADES = [1, 0.5, 0.25, 0.1] as const;

/** Quadros por segundo assumidos até o navegador informar os do vídeo. */
export const FPS_PADRAO = 30;

/**
 * Estima os quadros por segundo a partir dos tempos de mídia de quadros apresentados em
 * sequência (requestVideoFrameCallback): mediana dos intervalos, arredondada para um valor usual.
 */
export function estimarFps(temposMidia: number[]): number | null {
  const difs: number[] = [];
  for (let i = 1; i < temposMidia.length; i++) {
    const d = temposMidia[i]! - temposMidia[i - 1]!;
    if (d > 0.001 && d < 0.5) difs.push(d);
  }
  if (difs.length < 5) return null;
  difs.sort((a, b) => a - b);
  const fps = 1 / difs[Math.floor(difs.length / 2)]!;
  const usuais = [24, 25, 30, 50, 60, 100, 120, 240, 250, 300, 500, 1000];
  const perto = usuais.find((u) => Math.abs(u - fps) / u < 0.04);
  return perto ?? Math.round(fps);
}

/** Tempo do quadro vizinho (delta = ±1), mirando o meio do quadro e sem sair do vídeo. */
export function tempoDoQuadro(atual: number, fps: number, delta: number, duracao: number): number {
  const quadro = Math.floor(atual * fps + 1e-6) + delta;
  const t = (quadro + 0.5) / fps;
  const fim = Number.isFinite(duracao) && duracao > 0 ? duracao - 0.5 / fps : t;
  return Math.max(0.5 / fps, Math.min(fim, t));
}

export function numeroDoQuadro(t: number, fps: number): number {
  return Math.floor(t * fps + 1e-6) + 1;
}

/** "Quadro 37 (1,233 s) de Videolaringoscopia" — descrição curta da imagem capturada (até 200 caracteres). */
export function descricaoDoQuadro(t: number, fps: number, legenda: string): string {
  const s = t.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return `Quadro ${numeroDoQuadro(t, fps)} (${s} s) de ${legenda}`.slice(0, 200);
}

export function nomeArquivoQuadro(t: number, fps: number): string {
  return `quadro-${numeroDoQuadro(t, fps)}-${Math.round(t * 1000)}ms.png`;
}
