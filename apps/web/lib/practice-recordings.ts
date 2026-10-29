/**
 * Gravações de ensaio locais (MediaRecorder → IndexedDB).
 */

const DB_NAME = "estudio_musical_recordings";
const DB_VERSION = 1;
const STORE = "takes";

export type PracticeTake = {
  id: string;
  projectId: string;
  createdAt: string;
  durationMs: number;
  mimeType: string;
  label: string;
  /**
   * Posição na timeline da música (s) quando a gravação começou.
   * Ausente em takes antigos → tratado como 0.
   */
  offsetSec?: number;
  /** Blob serializado via ArrayBuffer no IDB */
  blob?: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Falha DB gravações"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
  });
}

export function createTakeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `take_${Date.now()}`;
}

export async function savePracticeTake(take: PracticeTake & { blob: Blob }): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(take);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPracticeTakes(projectId: string): Promise<PracticeTake[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("projectId");
      const req = idx.getAll(projectId);
      req.onsuccess = () => {
        const rows = (req.result as PracticeTake[]) ?? [];
        resolve(
          rows
            .map(({ blob: _b, ...meta }) => meta)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getPracticeTakeBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      const row = req.result as (PracticeTake & { blob?: Blob }) | undefined;
      resolve(row?.blob ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePracticeTake(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function pickRecorderMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm";
}
