/**
 * Orquestração de export via API real (stem | stems_zip | mixdown).
 * WAV, MP3, FLAC, M4A (AAC) e OGG + ZIP; tratamentos (ruído, voz, volume) e corte de trecho no worker.
 */

import { assetsApi, studioApi, type ExportJob, type StemMixState } from "@/lib/api";

export type ExportMode = "stem" | "all_tracks" | "custom_mix" | "minus_instrument";
export type AudioFormat = "wav" | "mp3" | "flac" | "m4a" | "ogg";
export type ExportFormat = AudioFormat | "zip";
export const AUDIO_FORMATS: AudioFormat[] = ["wav", "mp3", "flac", "m4a", "ogg"];

/** Tratamentos e corte aplicados pelo worker (validados na API: services/exportacao.py). */
export type ExportExtras = {
  reduzir_ruido?: boolean;
  realcar_voz?: boolean;
  normalizar?: boolean;
  inicio_s?: number;
  fim_s?: number;
};

/** Converte "1:23" ou "83" em segundos; vazio → undefined; inválido → null. */
export function parseTempo(texto: string): number | undefined | null {
  const t = texto.trim();
  if (!t) return undefined;
  const m = /^(?:(\d+):)?(\d+(?:[.,]\d+)?)$/.exec(t);
  if (!m) return null;
  const s = Number(m[2]!.replace(",", ".")) + Number(m[1] ?? 0) * 60;
  return Number.isFinite(s) ? s : null;
}

export type ExportPhase =
  | "idle"
  | "preparing"
  | "queued"
  | "processing"
  | "downloading"
  | "done"
  | "error";

export const EXPORT_MODES: {
  id: ExportMode;
  title: string;
  description: string;
  formats: ExportFormat[];
  defaultFormat: ExportFormat;
}[] = [
  {
    id: "stem",
    title: "Stem individual",
    description: "Baixa uma ou mais trilhas em arquivos separados (WAV, MP3, FLAC, M4A ou OGG): a voz isolada, só o instrumental, a guitarra…",
    formats: ["wav", "mp3", "flac", "m4a", "ogg"],
    defaultFormat: "wav",
  },
  {
    id: "all_tracks",
    title: "Todas as trilhas",
    description: "Pacote ZIP com todas as faixas ou um arquivo por faixa, no formato escolhido.",
    formats: ["zip", "wav", "mp3", "flac", "m4a", "ogg"],
    defaultFormat: "zip",
  },
  {
    id: "custom_mix",
    title: "Mixagem personalizada",
    description: "Mixdown com mute/volume do mix padrão (trilhas desmarcadas = mute nesta exportação).",
    formats: ["wav", "mp3", "flac", "m4a", "ogg"],
    defaultFormat: "wav",
  },
  {
    id: "minus_instrument",
    title: "Playback sem instrumento",
    description: "Mixdown silenciando a trilha escolhida (útil para treino).",
    formats: ["wav", "mp3", "flac", "m4a", "ogg"],
    defaultFormat: "wav",
  },
];

export function sanitizeFilename(name: string, ext: string): string {
  const base = name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const clean = base || "export";
  const e = ext.replace(/^\./, "");
  return clean.toLowerCase().endsWith(`.${e.toLowerCase()}`) ? clean : `${clean}.${e}`;
}

export function formatAllowed(mode: ExportMode, format: ExportFormat): boolean {
  const meta = EXPORT_MODES.find((m) => m.id === mode);
  return Boolean(meta?.formats.includes(format));
}

/** Estimativa conservadora do payload (bytes dos assets + margem ZIP/MP3). */
export function estimateExportBytes(
  mode: ExportMode,
  format: ExportFormat,
  selectedSizes: number[],
  allSizes: number[],
): number {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const mp3Factor = format === "flac" ? 0.6 : format === "mp3" || format === "m4a" || format === "ogg" ? 0.15 : 1;
  if (mode === "all_tracks" && format === "zip") {
    return Math.ceil(sum(allSizes) * 1.05 * (format === "zip" ? 1 : mp3Factor));
  }
  if (mode === "custom_mix" || mode === "minus_instrument") {
    const pool = allSizes.length ? allSizes : selectedSizes;
    const avg = pool.length ? sum(pool) / pool.length : 5_000_000;
    return Math.ceil(avg * mp3Factor);
  }
  return Math.ceil(sum(selectedSizes.length ? selectedSizes : allSizes) * mp3Factor);
}

export function hasEnoughDisk(freeBytes: number | null | undefined, estimate: number): {
  ok: boolean;
  reason?: string;
} {
  if (freeBytes == null || freeBytes < 0) {
    return { ok: true }; // sem dado de disco — não bloqueia
  }
  const need = estimate * 1.2 + 50_000_000; // margem + 50MB
  if (freeBytes < need) {
    return {
      ok: false,
      reason: `Espaço em disco insuficiente (livre menor que ~${Math.ceil(need / (1024 * 1024))} MB necessários).`,
    };
  }
  return { ok: true };
}

/** Progresso didático a partir do status real do job (API não expõe %). */
export function progressFromStatus(status: string, phase: ExportPhase): number {
  if (phase === "done") return 100;
  if (phase === "downloading") return 92;
  if (phase === "preparing") return 8;
  if (status === "queued") return 20;
  if (status === "processing") return 55;
  if (status === "completed") return 90;
  if (status === "failed") return 0;
  return 5;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function pollExportJob(
  jobId: string,
  onTick?: (job: ExportJob) => void,
  maxAttempts = 60,
): Promise<ExportJob> {
  for (let i = 0; i < maxAttempts; i++) {
    const cur = await studioApi.getExport(jobId);
    onTick?.(cur);
    if (cur.status === "completed" && cur.result_asset_id) return cur;
    if (cur.status === "failed") {
      throw new Error(cur.error_message || "Exportação falhou no worker");
    }
    await sleep(1000);
  }
  throw new Error("Timeout aguardando exportação");
}

export function triggerBrowserDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadExportAsset(assetId: string, filename: string) {
  const { url } = await assetsApi.playbackUrl(assetId);
  triggerBrowserDownload(url, filename);
  return url;
}

export async function runStemExports(
  projectId: string,
  stemTypes: string[],
  filenameBase: string,
  onJob?: (job: ExportJob, index: number, total: number) => void,
  format: AudioFormat = "wav",
  extras: ExportExtras = {},
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < stemTypes.length; i++) {
    const stemType = stemTypes[i]!;
    const job = await studioApi.createExport(
      projectId,
      { kind: "stem", params: { stem_type: stemType, format, ...extras } },
      `exp-stem-${projectId}-${stemType}-${Date.now()}-${i}`,
    );
    onJob?.(job, i, stemTypes.length);
    const done = await pollExportJob(job.id, (j) => onJob?.(j, i, stemTypes.length));
    const name = sanitizeFilename(`${filenameBase}_${stemType}`, format);
    const url = await downloadExportAsset(done.result_asset_id!, name);
    urls.push(url);
  }
  return urls;
}

export async function runZipExport(
  projectId: string,
  filenameBase: string,
  onJob?: (job: ExportJob) => void,
  format: AudioFormat = "wav",
  extras: ExportExtras = {},
): Promise<string> {
  const job = await studioApi.createExport(
    projectId,
    { kind: "stems_zip", params: { format, ...extras } },
    `exp-zip-${projectId}-${Date.now()}`,
  );
  onJob?.(job);
  const done = await pollExportJob(job.id, onJob);
  return downloadExportAsset(done.result_asset_id!, sanitizeFilename(filenameBase, "zip"));
}

export async function runMixdownExport(
  projectId: string,
  filenameBase: string,
  mixState: { stems: Record<string, StemMixState>; master_gain: number },
  previousState: { stems: Record<string, StemMixState>; master_gain: number } | null,
  onJob?: (job: ExportJob) => void,
  format: AudioFormat = "wav",
  extras: ExportExtras = {},
): Promise<string> {
  await studioApi.putMix(projectId, {
    name: "Padrão",
    is_default: true,
    state: mixState,
  });
  try {
    const job = await studioApi.createExport(
      projectId,
      { kind: "mixdown", params: { format, ...extras } },
      `exp-mix-${projectId}-${Date.now()}`,
    );
    onJob?.(job);
    const done = await pollExportJob(job.id, onJob);
    return await downloadExportAsset(done.result_asset_id!, sanitizeFilename(filenameBase, format));
  } finally {
    if (previousState) {
      await studioApi.putMix(projectId, {
        name: "Padrão",
        is_default: true,
        state: previousState,
      }).catch(() => undefined);
    }
  }
}

export function defaultStemMix(types: string[]): Record<string, StemMixState> {
  const out: Record<string, StemMixState> = {};
  for (const t of types) {
    out[t] = { volume: 1, mute: false, solo: false, pan: 0 };
  }
  return out;
}
