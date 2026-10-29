/** Extrai picos normalizados para waveform preliminar (Web Audio API). */

export async function extractWaveformPeaks(
  file: File,
  bars = 64,
): Promise<number[]> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return [];

  const ctx = new AudioCtx();
  try {
    const buffer = await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    const channel = audio.getChannelData(0);
    const block = Math.floor(channel.length / bars) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      const start = i * block;
      let max = 0;
      for (let j = 0; j < block && start + j < channel.length; j++) {
        const v = Math.abs(channel[start + j] ?? 0);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    const peak = Math.max(...peaks, 0.0001);
    return peaks.map((p) => Math.min(1, p / peak));
  } catch {
    return [];
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
