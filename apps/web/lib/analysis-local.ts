/**
 * Letras e seções musicais por projeto (IndexedDB).
 * BPM/tom/acordes ficam no backend (projects); estrutura e letras ainda não têm API.
 */

const DB_NAME = "estudio_musical_analysis";
const DB_VERSION = 1;
const STORE = "kv";

export type SectionKind = "intro" | "verse" | "chorus" | "bridge" | "outro" | "custom";

export type MusicSection = {
  id: string;
  kind: SectionKind;
  label: string;
  start_sec: number;
  end_sec: number;
};

export type ProjectAnalysisLocal = {
  projectId: string;
  lyrics: string;
  sections: MusicSection[];
  /** Compasso definido pelo usuário (detecção automática indisponível). */
  time_signature: string | null;
  updatedAt: string;
};

const DEFAULT = (projectId: string): ProjectAnalysisLocal => ({
  projectId,
  lyrics: "",
  sections: [],
  time_signature: null,
  updatedAt: new Date().toISOString(),
});

export const SECTION_KINDS: { kind: SectionKind; label: string }[] = [
  { kind: "intro", label: "Introdução" },
  { kind: "verse", label: "Verso" },
  { kind: "chorus", label: "Refrão" },
  { kind: "bridge", label: "Ponte" },
  { kind: "outro", label: "Final" },
  { kind: "custom", label: "Outro" },
];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Falha DB análise"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
}

export async function loadProjectAnalysis(projectId: string): Promise<ProjectAnalysisLocal> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(projectId);
      req.onsuccess = () => {
        const v = req.result as ProjectAnalysisLocal | undefined;
        resolve(v?.projectId ? v : DEFAULT(projectId));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return DEFAULT(projectId);
  }
}

export async function saveProjectAnalysis(data: ProjectAnalysisLocal): Promise<void> {
  const row = { ...data, updatedAt: new Date().toISOString() };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(row, data.projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export function newSectionId(): string {
  return crypto.randomUUID();
}
