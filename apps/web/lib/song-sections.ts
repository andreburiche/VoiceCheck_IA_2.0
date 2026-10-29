/**
 * Seções musicais manuais por projeto (IndexedDB).
 * Intro / verso / refrão etc. — sem ASR.
 */

const DB_NAME = "estudio_musical_sections";
const DB_VERSION = 1;
const STORE = "kv";

export type SongSection = {
  id: string;
  name: string;
  startMs: number;
  endMs: number;
  color?: string;
};

export type SongSectionsState = {
  projectId: string;
  sections: SongSection[];
  updatedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Falha DB seções"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
}

export function createSectionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `sec_${Date.now()}`;
}

export async function loadSongSections(projectId: string): Promise<SongSection[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(projectId);
      req.onsuccess = () => {
        const v = req.result as SongSectionsState | undefined;
        resolve(Array.isArray(v?.sections) ? v!.sections : []);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveSongSections(projectId: string, sections: SongSection[]): Promise<void> {
  const db = await openDb();
  const payload: SongSectionsState = {
    projectId,
    sections,
    updatedAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(payload, projectId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const SECTION_PRESETS = ["Intro", "Verso", "Pré-refrão", "Refrão", "Ponte", "Solo", "Final"] as const;
