/**
 * DSP experimental no client para laboratório vocal.
 * Não é IA neural: gate espectral simples + corte de ambiência.
 * Qualidade limitada — sempre rotular como experimental.
 */

export type VocalLabPreset = "noise" | "ambience" | "both";

export type VocalLabOptions = {
  /** Intensidade 0..1 */
  amount: number;
  preset: VocalLabPreset;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/**
 * Processa um AudioBuffer offline e devolve novo buffer.
 * - noise: gate por RMS de frame (reduz hiss/ruído de fundo)
 * - ambience: high-pass + leve compressão de cauda (não é de-reverb ML)
 */
export async function processVocalBuffer(
  ctx: BaseAudioContext,
  input: AudioBuffer,
  options: VocalLabOptions,
): Promise<AudioBuffer> {
  const amount = clamp01(options.amount);
  const channels = input.numberOfChannels;
  const length = input.length;
  const sr = input.sampleRate;
  const out = ctx.createBuffer(channels, length, sr);

  const frameSize = Math.max(128, Math.floor(sr * 0.02)); // ~20ms
  const doNoise = options.preset === "noise" || options.preset === "both";
  const doAmb = options.preset === "ambience" || options.preset === "both";

  // High-pass suave (~120 Hz) para ambiência — FIR 1-polo aproximado
  const hpCoeff = doAmb ? Math.exp((-2 * Math.PI * (80 + amount * 120)) / sr) : 0;

  for (let ch = 0; ch < channels; ch++) {
    const src = input.getChannelData(ch);
    const dst = out.getChannelData(ch);
    let hpState = 0;
    let prev = 0;

    for (let i = 0; i < length; i += frameSize) {
      const end = Math.min(length, i + frameSize);
      let sumSq = 0;
      for (let j = i; j < end; j++) {
        const s = src[j] ?? 0;
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / Math.max(1, end - i));
      // limiar sobe com amount → mais agressivo
      const threshold = 0.002 + amount * 0.04;
      let gate = 1;
      if (doNoise) {
        gate = rms < threshold ? Math.max(0, 1 - amount * 0.95) : 1;
      }

      for (let j = i; j < end; j++) {
        let s = (src[j] ?? 0) * gate;
        if (doAmb) {
          const hp = s - prev + hpCoeff * hpState;
          prev = s;
          hpState = hp;
          // mistura dry/wet: amount controla quanto do high-pass entra
          s = s * (1 - amount * 0.55) + hp * (amount * 0.55);
        }
        dst[j] = s;
      }
    }
  }

  return out;
}

export async function decodeArrayBuffer(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return ctx.decodeAudioData(data.slice(0));
}

/** Exporta AudioBuffer mono/stereo para WAV PCM 16-bit. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const dataLength = len * numCh * 2;
  const ab = new ArrayBuffer(44 + dataLength);
  const view = new DataView(ab);

  function writeStr(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLength, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c]![i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
