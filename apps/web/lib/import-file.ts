export const IMPORT_ACCEPT =
  ".mp3,.wav,.flac,.mp4,audio/mpeg,audio/wav,audio/flac,audio/x-wav,audio/x-flac,video/mp4";

export const IMPORT_EXTENSIONS = [".mp3", ".wav", ".flac", ".mp4"] as const;

export type ImportFileMeta = {
  file: File;
  name: string;
  format: string;
  sizeBytes: number;
  mime: string;
  durationMs: number | null;
};

export function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

export function detectFormat(name: string, mime: string): string {
  const lower = name.toLowerCase();
  for (const ext of IMPORT_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext.slice(1);
  }
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("mp4")) return "mp4";
  return "unknown";
}

export function validateImportFile(
  file: File,
  opts: { maxBytes: number },
): { ok: true } | { ok: false; message: string } {
  const format = detectFormat(file.name, file.type || guessMime(file.name));
  if (format === "unknown" || !IMPORT_EXTENSIONS.some((e) => file.name.toLowerCase().endsWith(e))) {
    return {
      ok: false,
      message: "Formato não suportado. Use MP3, WAV, FLAC ou MP4.",
    };
  }
  if (file.size <= 0) {
    return { ok: false, message: "Arquivo vazio." };
  }
  if (file.size > opts.maxBytes) {
    const mb = (opts.maxBytes / (1024 * 1024)).toFixed(0);
    return { ok: false, message: `Arquivo acima do limite de ${mb} MB.` };
  }
  return { ok: true };
}

export async function readAudioDurationMs(file: File): Promise<number | null> {
  try {
    const url = URL.createObjectURL(file);
    const duration = await new Promise<number | null>((resolve) => {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(d) ? Math.round(d * 1000) : null);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      audio.src = url;
    });
    return duration;
  } catch {
    return null;
  }
}
