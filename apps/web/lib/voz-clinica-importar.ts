/**
 * VoiceCheck IA 2.0 — importar um arquivo de áudio (como no VoxMetria) e recortar trechos.
 * O navegador decodifica WAV, MP3, M4A, OGG etc.; o servidor recebe sempre WAV PCM 16 bits mono.
 */
import type { GravacaoClinica } from "@/lib/voz-clinica-gravador";
import { codificarWav, misturarMono, recortar } from "@/lib/voz-clinica-wav";
import { lerWavPcm16 } from "@/lib/voz-clinica-espectrograma";

export const LIMITE_IMPORTACAO_S = 60;
const COMPRIMIDOS = /\.(mp3|m4a|aac|ogg|opus|webm|wma)$/i;

export async function importarAudio(arquivo: File, limite_s = LIMITE_IMPORTACAO_S): Promise<GravacaoClinica> {
  const avisos: string[] = [];
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Este navegador não abre arquivos de áudio.");
  const ctx = new Ctx();
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(await arquivo.arrayBuffer());
  } catch {
    throw new Error("Não foi possível abrir o arquivo. Use WAV, MP3, M4A ou OGG.");
  } finally {
    void ctx.close();
  }
  let amostras = misturarMono(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)));
  if (buf.duration > limite_s) {
    amostras = recortar(amostras, buf.sampleRate, 0, limite_s);
    avisos.push(`O arquivo tem ${Math.round(buf.duration)} s; foram usados os primeiros ${limite_s} s. Recorte o trecho desejado.`);
  }
  if (COMPRIMIDOS.test(arquivo.name) || /mpeg|mp4|aac|ogg|opus|webm/.test(arquivo.type)) {
    avisos.push("Arquivo comprimido (MP3, M4A, OGG…): a compressão altera jitter, shimmer e HNR. Prefira WAV.");
  }
  const taxa = Math.round(buf.sampleRate);
  return { wav: new Blob([codificarWav(amostras, taxa)], { type: "audio/wav" }), duracao: amostras.length / taxa, taxa, avisos };
}

/** Recorta uma gravação (WAV 16 bits) entre início e fim, em segundos. */
export async function recortarGravacao(g: GravacaoClinica, inicio_s: number, fim_s: number): Promise<GravacaoClinica> {
  const { amostras, taxa } = lerWavPcm16(await g.wav.arrayBuffer());
  const trecho = recortar(amostras, taxa, inicio_s, fim_s);
  if (trecho.length < 0.5 * taxa) throw new Error("O trecho precisa ter pelo menos 0,5 s.");
  return { wav: new Blob([codificarWav(trecho, taxa)], { type: "audio/wav" }), duracao: trecho.length / taxa, taxa, avisos: g.avisos };
}
