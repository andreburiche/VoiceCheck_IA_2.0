/**
 * Persistência local da Biblioteca (favoritos, coleções, preferências de UI).
 * Usa IndexedDB no browser; a API é isolada para trocar por SQLite no shell Tauri
 * sem alterar os consumidores.
 */

const DB_NAME = "estudio_musical_library";
const DB_VERSION = 1;
const STORE = "kv";

export type LibraryViewMode = "cards" | "table";

export type LibrarySortKey = "updated" | "name" | "artist" | "duration" | "bpm";

export type LibraryPrefs = {
  viewMode: LibraryViewMode;
  sortKey: LibrarySortKey;
  sortDir: "asc" | "desc";
};

export type LibraryCollection = {
  id: string;
  name: string;
  projectIds: string[];
  createdAt: string;
};

/** Setlist ordenada (ensaio / repertório) — distinta de coleções. */
export type LibrarySetlist = {
  id: string;
  name: string;
  /** Ordem de prática. */
  projectIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type LibraryLocalState = {
  favorites: string[];
  collections: LibraryCollection[];
  setlists: LibrarySetlist[];
  prefs: LibraryPrefs;
};

const DEFAULT_STATE: LibraryLocalState = {
  favorites: [],
  collections: [],
  setlists: [],
  prefs: {
    viewMode: "cards",
    sortKey: "updated",
    sortDir: "desc",
  },
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir DB local"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const memoryFallback: { state: LibraryLocalState } = {
  state: structuredClone(DEFAULT_STATE),
};

export async function loadLibraryLocalState(): Promise<LibraryLocalState> {
  try {
    const saved = await idbGet<LibraryLocalState>("state");
    if (!saved) return structuredClone(DEFAULT_STATE);
    return {
      favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
      collections: Array.isArray(saved.collections) ? saved.collections : [],
      setlists: Array.isArray(saved.setlists) ? saved.setlists : [],
      prefs: {
        ...DEFAULT_STATE.prefs,
        ...(saved.prefs ?? {}),
      },
    };
  } catch {
    return structuredClone(memoryFallback.state);
  }
}

export async function saveLibraryLocalState(state: LibraryLocalState): Promise<void> {
  memoryFallback.state = state;
  try {
    await idbSet("state", state);
  } catch {
    /* memória já atualizada */
  }
}

export function createCollectionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createSetlistId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `set_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
