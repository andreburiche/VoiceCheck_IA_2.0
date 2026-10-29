/**
 * Fallback browser: áudio puro → WAV via Web Audio (sem FFmpeg).
 * Vídeo exige API + FFmpeg.
 */

import { audioBufferToWav, decodeArrayBuffer } from "@/lib/vocal-dsp";
import type { VoiceCheckProbeLocal } from "@/lib/voicecheck-store";

export async function prepareAudioInBrowser(
  file: Blob,
): Promise<{ wav: Blob; probe: VoiceCheckProbeLocal }> {
  const ctx = new AudioContext();
  try {
    const buf = await decodeArrayBuffer(ctx, await file.arrayBuffer());
    // Remixar para mono
    const mono = ctx.createBuffer(1, buf.length, buf.sampleRate);
    const out = mono.getChannelData(0);
    const nCh = buf.numberOfChannels;
    for (let i = 0; i < buf.length; i++) {
      let s = 0;
      for (let c = 0; c < nCh; c++) s += buf.getChannelData(c)[i] ?? 0;
      out[i] = s / nCh;
    }
    const wav = audioBufferToWav(mono);
    return {
      wav,
      probe: {
        durationMs: Math.round(buf.duration * 1000),
        sampleRate: buf.sampleRate,
        channels: 1,
        hasAudio: true,
        hasVideo: false,
        formatName: "browser-decode",
        audioCodec: "pcm",
        videoCodec: null,
        source: "browser",
      },
    };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
