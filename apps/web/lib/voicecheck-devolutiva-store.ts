/**
 * Persistência separada: snapshot técnico + devolutiva editável.
 * Não altera o JSON técnico ao editar a devolutiva.
 */

import type { VoiceCheckDevolutiva } from "@/lib/voicecheck-devolutiva";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";

const DB_NAME = "estudio_musical_voicecheck";
const DB_VERSION = 3;
const ANALYSIS_STORE = "analysis_snapshots";
const DEVOLUTIVA_STORE = "devolutivas";

export type VoiceCheckAnalysisSnapshot = {
  id: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  fingerprint: string;
  report: VoiceCheckF0Report;
  assetName?: string | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Falha DB devolutiva"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("references")) {
        db.createObjectStore("references", { keyPath: "id" });
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

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `snap_${Date.now()}`;
}

export async function findAnalysisSnapshotByFingerprint(
  fingerprint: string,
): Promise<VoiceCheckAnalysisSnapshot | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANALYSIS_STORE, "readonly");
    const req = tx.objectStore(ANALYSIS_STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as VoiceCheckAnalysisSnapshot[]) ?? [];
      const match = rows
        .filter((r) => r.fingerprint === fingerprint)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      resolve(match ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Snapshot mais recente ligado a um diagnóstico (para registros antigos sem relatório salvo). */
export async function findAnalysisSnapshotByProject(
  projectId: string,
): Promise<VoiceCheckAnalysisSnapshot | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANALYSIS_STORE, "readonly");
    const req = tx.objectStore(ANALYSIS_STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as VoiceCheckAnalysisSnapshot[]) ?? [];
      const match = rows
        .filter((r) => r.projectId === projectId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      resolve(match ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveAnalysisSnapshot(input: {
  id?: string;
  projectId?: string | null;
  fingerprint: string;
  report: VoiceCheckF0Report;
  assetName?: string | null;
}): Promise<VoiceCheckAnalysisSnapshot> {
  const now = new Date().toISOString();
  const byId = input.id ? await getAnalysisSnapshot(input.id) : null;
  const byFp = byId ? null : await findAnalysisSnapshotByFingerprint(input.fingerprint);
  const existing = byId ?? byFp;
  const row: VoiceCheckAnalysisSnapshot = {
    id: existing?.id ?? input.id ?? id(),
    projectId: input.projectId ?? existing?.projectId ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    fingerprint: input.fingerprint,
    report: input.report,
    assetName: input.assetName ?? existing?.assetName ?? null,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ANALYSIS_STORE, "readwrite");
    tx.objectStore(ANALYSIS_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return row;
}

export async function getAnalysisSnapshot(
  id: string,
): Promise<VoiceCheckAnalysisSnapshot | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANALYSIS_STORE, "readonly");
    const req = tx.objectStore(ANALYSIS_STORE).get(id);
    req.onsuccess = () => resolve((req.result as VoiceCheckAnalysisSnapshot) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDevolutiva(d: VoiceCheckDevolutiva): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DEVOLUTIVA_STORE, "readwrite");
    tx.objectStore(DEVOLUTIVA_STORE).put(d);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDevolutiva(id: string): Promise<VoiceCheckDevolutiva | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEVOLUTIVA_STORE, "readonly");
    const req = tx.objectStore(DEVOLUTIVA_STORE).get(id);
    req.onsuccess = () => resolve((req.result as VoiceCheckDevolutiva) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listDevolutivasByFingerprint(
  fingerprint: string,
): Promise<VoiceCheckDevolutiva[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEVOLUTIVA_STORE, "readonly");
    const req = tx.objectStore(DEVOLUTIVA_STORE).getAll();
    req.onsuccess = () => {
      const rows = ((req.result as VoiceCheckDevolutiva[]) ?? [])
        .filter((r) => r.analysisFingerprint === fingerprint)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Preferência: rascunho mais recente; senão, aprovada mais recente.
 * Versões aprovadas permanecem no store ao regenerar (novo id).
 */
export async function getDevolutivaByFingerprint(
  fingerprint: string,
): Promise<VoiceCheckDevolutiva | null> {
  const rows = await listDevolutivasByFingerprint(fingerprint);
  if (!rows.length) return null;
  const draft = rows.find((r) => r.status === "draft");
  if (draft) return draft;
  return rows.find((r) => r.status === "approved") ?? rows[0] ?? null;
}
