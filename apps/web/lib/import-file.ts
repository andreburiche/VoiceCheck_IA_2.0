export const IMPORT_EXTENSIONS = [
  ".mp3", ".wav", ".flac", ".mp4", ".m4a", ".mov", ".aac", ".ogg", ".oga", ".opus", ".webm", ".mkv",
] as const;

export const IMPORT_ACCEPT = [
  ...IMPORT_EXTENSIONS,
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac", "audio/x-flac", "audio/mp4", "audio/x-m4a", "audio/aac",
  "audio/ogg", "audio/opus", "audio/webm", "video/mp4", "video/quicktime", "video/webm", "video/x-matroska",
].join(",");

/** MIME que a API espera para cada extensão (o navegador às vezes manda vazio ou genérico). */
const MIME_POR_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac", ".mp4": "video/mp4", ".m4a": "audio/mp4",
  ".mov": "video/quicktime", ".aac": "audio/aac", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg",
  ".webm": "video/webm", ".mkv": "video/x-matroska",
};

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
  const ext = IMPORT_EXTENSIONS.find((e) => lower.endsWith(e));
  return ext ? MIME_POR_EXT[ext]! : "application/octet-stream";
}

export function detectFormat(name: string, mime: string): string {
  const lower = name.toLowerCase();
  for (const ext of IMPORT_EXTENSIONS) {
    if (lower.endsWith(ext)) return ext.slice(1);
  }
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("mp4") || mime.includes("quicktime")) return "mp4";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("webm") || mime.includes("matroska")) return "webm";
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
      message: "Formato não suportado. Use MP3, WAV, FLAC, M4A, AAC, OGG, MP4, MOV, WEBM ou MKV.",
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
