/**
 * Projetos VoiceCheck locais (IndexedDB).
 * Contrato isolado para migrar a SQLite / API nas fases 8+.
 */

import type { AutotuneSettings, AutotuneStats, EnhanceSettings, EnhanceStats } from "@/lib/api";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";
import type { VoiceMixState } from "@/lib/voice-mix";

const DB_NAME = "estudio_musical_voicecheck";
/** v3: analysis_snapshots + devolutivas (ver voicecheck-devolutiva-store.ts). */
const DB_VERSION = 3;
const STORE = "projects";
const REF_STORE = "references";
const ANALYSIS_STORE = "analysis_snapshots";
const DEVOLUTIVA_STORE = "devolutivas";

export type VoiceCheckStep =
  | "importar"
  | "preparar"
  | "analisar"
  | "resultados"
  | "melhorar";

export type VoiceCheckAssetMeta = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Duração medida no client (s), se disponível. */
  durationSec: number | null;
  kind: "audio" | "video" | "unknown";
  /** Extensão normalizada. */
  ext: string;
};

export type VoiceCheckProbeLocal = {
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  formatName: string | null;
  audioCodec: string | null;
  videoCodec: string | null;
  source: "ffprobe" | "browser";
  /** O WAV preparado é só a voz (instrumentos removidos com IA). */
  voiceIsolated?: boolean;
};

export type VoiceCheckProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  step: VoiceCheckStep;
  asset: VoiceCheckAssetMeta | null;
  /** Blob do arquivo original (não modificado). */
  blob?: Blob;
  /** WAV interno mono 44.1 kHz após preparação. */
  preparedWav?: Blob;
  prepareJobId?: string | null;
  probe?: VoiceCheckProbeLocal | null;
  notes?: string;
  /** Etapa mais avançada já liberada (índice em VOICECHECK_STEP_ORDER). */
  maxReached?: number;
  /** Relatório da análise, para reabrir os resultados sem rodar de novo. */
  f0Report?: VoiceCheckF0Report | null;
  analysisSource?: "python" | "browser_fallback" | null;
  /** Resumo leve para a lista (evita ler o relatório inteiro). */
  summary?: VoiceCheckProjectSummary | null;
  /** Estado da cópia no servidor (mantido entre salvamentos locais). */
  sync?: VoiceCheckSyncState;
  /** Equalização e efeitos escolhidos para a voz (reverb, delay…). */
  voiceMix?: VoiceMixState | null;
  /** WAV preparado com instrumentos (antes de isolar a voz). */
  mixWav?: Blob;
  /** Versão afinada (autotune) gerada a partir do WAV preparado. */
  correctedWav?: Blob;
  autotune?: VoiceCheckAutotuneInfo | null;
};

/** Versão aprimorada salva com o diagnóstico ("Aprimorar com IA"). */
export type VoiceCheckAutotuneInfo =
  | {
      kind: "enhance";
      settings: EnhanceSettings;
      stats: EnhanceStats | null;
      createdAt: string;
    }
  | {
      /** Formato antigo (só afinação). */
      kind?: "autotune";
      settings: AutotuneSettings;
      stats: AutotuneStats | null;
      createdAt: string;
    };

export type VoiceCheckSyncState = {
  /** Última vez que os metadados foram enviados com sucesso. */
  syncedAt?: string | null;
  /** updatedAt local que foi enviado (se for igual ao atual, está em dia). */
  syncedUpdatedAt?: string | null;
  /** Tamanho dos arquivos já enviados (muda quando o arquivo muda). */
  originalSize?: number | null;
  preparedSize?: number | null;
  correctedSize?: number | null;
  /** Impressão digital do relatório enviado. */
  reportFp?: string | null;
  /** Último erro de envio (ex.: cota cheia). */
  error?: string | null;
};

export type VoiceCheckProjectSummary = {
  events: number;
  positives: number;
  validFramePercent: number | null;
};

/** Item da lista: só metadados, sem áudio nem relatório completo. */
export type VoiceCheckProjectListItem = Omit<
  VoiceCheckProject,
  "blob" | "preparedWav" | "f0Report" | "correctedWav" | "mixWav"
> & {
  hasCorrected?: boolean;
  /** Onde o diagnóstico existe: só aqui, só no servidor, ou nos dois. */
  location?: "local" | "server" | "both";
  /** Sincronização em andamento (preenchido pela tela). */
  syncing?: boolean;
  /** A versão do servidor é mais nova que a cópia deste navegador. */
  stale?: boolean;
  hasPreparedWav: boolean;
  hasReport: boolean;
};

export function summarizeReport(report: VoiceCheckF0Report | null | undefined): VoiceCheckProjectSummary | null {
  if (!report) return null;
  return {
    events: report.events?.length ?? 0,
    positives: report.positive_findings?.length ?? 0,
    validFramePercent: report.statistics?.valid_frame_percent ?? null,
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Falha DB VoiceCheck"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(REF_STORE)) {
        db.createObjectStore(REF_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(ANALYSIS_STORE)) {
        db.createObjectStore(ANALYSIS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DEVOLUTIVA_STORE)) {
        db.createObjectStore(DEVOLUTIVA_STORE, { keyPath: "id" });
      }
    };
  });
}

export function createVoiceCheckId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `vc_${Date.now()}`;
}

export function sniffVoiceCheckFile(file: File): VoiceCheckAssetMeta {
  const name = file.name;
  const ext = (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "").toLowerCase();
  const mime = file.type || "application/octet-stream";
  const audioExt = new Set(["mp3", "wav", "flac", "m4a", "ogg", "aac"]);
  const videoExt = new Set(["mp4", "mov", "webm", "mkv"]);
  let kind: VoiceCheckAssetMeta["kind"] = "unknown";
  if (mime.startsWith("audio/") || audioExt.has(ext)) kind = "audio";
  else if (mime.startsWith("video/") || videoExt.has(ext)) kind = "video";
  return {
    name,
    mimeType: mime,
    sizeBytes: file.size,
    durationSec: null,
    kind,
    ext,
  };
}

export const VOICECHECK_ACCEPT =
  "audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/mp4,audio/x-m4a,video/mp4,video/quicktime,.mp3,.wav,.flac,.m4a,.mp4,.mov";

export function isAllowedVoiceCheckFile(file: File): boolean {
  const meta = sniffVoiceCheckFile(file);
  const ok = new Set(["mp3", "wav", "flac", "m4a", "mp4", "mov"]);
  return ok.has(meta.ext) || meta.kind === "audio" || meta.kind === "video";
}

export async function saveVoiceCheckProject(
  project: VoiceCheckProject & { blob?: Blob },
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    if (project.sync !== undefined) {
      store.put(project);
    } else {
      // Mantém o estado de sincronização já gravado (a tela não o conhece).
      const getReq = store.get(project.id);
      getReq.onsuccess = () => {
        const prev = getReq.result as VoiceCheckProject | undefined;
        store.put(prev?.sync ? { ...project, sync: prev.sync } : project);
      };
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Atualiza só o estado de sincronização, sem mexer em updatedAt. */
export async function patchVoiceCheckSync(id: string, sync: VoiceCheckSyncState): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const prev = getReq.result as VoiceCheckProject | undefined;
      if (prev) store.put({ ...prev, sync: { ...(prev.sync ?? {}), ...sync } });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listVoiceCheckProjects(): Promise<VoiceCheckProjectListItem[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result as VoiceCheckProject[]) ?? [];
        resolve(
          rows
            .map(({ blob: _b, preparedWav, f0Report, correctedWav, mixWav: _m, ...meta }) => ({
              ...meta,
              summary: meta.summary ?? summarizeReport(f0Report),
              hasPreparedWav: Boolean(preparedWav),
              hasReport: Boolean(f0Report),
              hasCorrected: Boolean(correctedWav),
              location: "local" as const,
            }))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getVoiceCheckProject(
  id: string,
): Promise<(VoiceCheckProject & { blob?: Blob }) | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as VoiceCheckProject) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function renameVoiceCheckProject(id: string, title: string): Promise<void> {
  const row = await getVoiceCheckProject(id);
  if (!row) throw new Error("Diagnóstico não encontrado");
  const clean = title.trim().slice(0, 120);
  if (!clean) throw new Error("Informe um nome");
  await saveVoiceCheckProject({ ...row, title: clean, updatedAt: new Date().toISOString() });
}

export async function deleteVoiceCheckProject(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
