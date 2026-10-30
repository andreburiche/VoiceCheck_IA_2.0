/**
 * VoiceCheck IA 2.0 — WAV PCM 16 bits mono para a avaliação clínica.
 * Sem compressão: MP3/Opus distorcem jitter, shimmer e HNR.
 */

/** Junta blocos Float32Array em um só, na ordem. */
export function juntarBlocos(blocos: Float32Array[]): Float32Array {
  const total = blocos.reduce((soma, b) => soma + b.length, 0);
  const saida = new Float32Array(total);
  let pos = 0;
  for (const b of blocos) {
    saida.set(b, pos);
    pos += b.length;
  }
  return saida;
}

/** Codifica amostras (-1..1) em WAV PCM 16 bits mono. */
export function codificarWav(amostras: Float32Array, taxa: number): ArrayBuffer {
  if (!(amostras instanceof Float32Array)) throw new TypeError("amostras precisa ser Float32Array");
  if (!Number.isInteger(taxa) || taxa <= 0) throw new RangeError("taxa de amostragem inválida");

  const tamanhoDados = amostras.length * 2;
  const buffer = new ArrayBuffer(44 + tamanhoDados);
  const v = new DataView(buffer);
  const texto = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i));
  };

  texto(0, "RIFF");
  v.setUint32(4, 36 + tamanhoDados, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texto(36, "data");
  v.setUint32(40, tamanhoDados, true);

  let pos = 44;
  for (let i = 0; i < amostras.length; i++) {
    const s = Math.max(-1, Math.min(1, amostras[i] || 0));
    v.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    pos += 2;
  }
  return buffer;
}

/** Média dos canais (estéreo → mono), como o servidor faz ao ler o WAV. */
export function misturarMono(canais: Float32Array[]): Float32Array {
  if (!canais.length) return new Float32Array(0);
  if (canais.length === 1) return canais[0]!;
  const n = Math.min(...canais.map((c) => c.length));
  const saida = new Float32Array(n);
  for (const c of canais) for (let i = 0; i < n; i++) saida[i]! += c[i]! / canais.length;
  return saida;
}

/** Trecho [inicio, fim) em segundos, limitado à duração. */
export function recortar(amostras: Float32Array, taxa: number, inicio_s: number, fim_s: number): Float32Array {
  const a = Math.max(0, Math.min(amostras.length, Math.round(inicio_s * taxa)));
  const b = Math.max(a, Math.min(amostras.length, Math.round(fim_s * taxa)));
  return amostras.slice(a, b);
}
