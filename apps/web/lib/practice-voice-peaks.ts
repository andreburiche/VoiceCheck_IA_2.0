import { extractPeaks } from "@/lib/audio-peaks";

/** Decodifica um blob de ensaio e extrai picos leves. */
export async function decodeTakePeaks(
  blob: Blob,
  buckets = 800,
): Promise<{ peaks: Float32Array; durationSec: number } | null> {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  const ab = await blob.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(ab.slice(0));
    return { peaks: extractPeaks(buf, buckets), durationSec: buf.duration };
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/**
 * Posiciona picos do ensaio na timeline da música (silêncio fora do trecho).
 * offsetSec = posição da base quando a gravação começou.
 */
export function placePeaksOnTimeline(
  takePeaks: Float32Array,
  offsetSec: number,
  takeDurSec: number,
  songDurSec: number,
  buckets = 800,
): Float32Array {
  const out = new Float32Array(buckets);
  if (songDurSec <= 0 || takePeaks.length === 0 || takeDurSec <= 0) return out;
  const start = Math.max(0, offsetSec);
  const end = Math.min(songDurSec, offsetSec + takeDurSec);
  if (end <= start) return out;

  for (let i = 0; i < buckets; i++) {
    const t = (i / buckets) * songDurSec;
    if (t < start || t >= end) continue;
    const local = (t - offsetSec) / takeDurSec;
    const j = Math.min(takePeaks.length - 1, Math.max(0, Math.floor(local * takePeaks.length)));
    out[i] = takePeaks[j] ?? 0;
  }
  return out;
}
