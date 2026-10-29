/** Extrai picos leves de um AudioBuffer (mono, ~800 amostras). */
export function extractPeaks(buffer: AudioBuffer, buckets = 800): Float32Array {
  const ch = buffer.getChannelData(0);
  const out = new Float32Array(buckets);
  const block = Math.max(1, Math.floor(ch.length / buckets));
  for (let i = 0; i < buckets; i++) {
    const start = i * block;
    let peak = 0;
    for (let j = start; j < start + block && j < ch.length; j++) {
      peak = Math.max(peak, Math.abs(ch[j]!));
    }
    out[i] = peak;
  }
  return out;
}
