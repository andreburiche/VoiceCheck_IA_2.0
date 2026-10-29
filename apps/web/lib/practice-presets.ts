/**
 * Presets de prática locais (IndexedDB) — velocidade, metrônomo, loop, perfil.
 * Contrato isolado para migrar a SQLite no Tauri.
 */

const DB_NAME = "estudio_musical_practice";
const DB_VERSION = 1;
const STORE = "kv";

export type PracticePreset = {
  id: string;
  name: string;
  projectId: string;
  profile: string;
  speedPct: number;
  metronomeOn: boolean;
  metronomeBpm: number;
  countIn: boolean;
  loopOn: boolean;
  loopA: number;
  loopB: number;
  notes: string;
  createdAt: string;
};

type PracticePresetState = {
  presets: PracticePreset[];
};

const DEFAULT: PracticePresetState = { presets: [] };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Falha DB prática"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
}

async function getState(): Promise<PracticePresetState> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get("state");
      req.onsuccess = () => {
        const v = req.result as PracticePresetState | undefined;
        resolve(v?.presets ? v : structuredClone(DEFAULT));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return structuredClone(DEFAULT);
  }
}

async function setState(state: PracticePresetState): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(state, "state");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function listPracticePresets(projectId: string): Promise<PracticePreset[]> {
  const state = await getState();
  return state.presets.filter((p) => p.projectId === projectId);
}

export async function savePracticePreset(
  preset: Omit<PracticePreset, "id" | "createdAt"> & { id?: string },
): Promise<PracticePreset> {
  const state = await getState();
  const row: PracticePreset = {
    id: preset.id ?? crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: preset.name,
    projectId: preset.projectId,
    profile: preset.profile,
    speedPct: preset.speedPct,
    metronomeOn: preset.metronomeOn,
    metronomeBpm: preset.metronomeBpm,
    countIn: preset.countIn,
    loopOn: preset.loopOn,
    loopA: preset.loopA,
    loopB: preset.loopB,
    notes: preset.notes,
  };
  const others = state.presets.filter((p) => p.id !== row.id);
  await setState({ presets: [row, ...others] });
  return row;
}

export async function deletePracticePreset(id: string): Promise<void> {
  const state = await getState();
  await setState({ presets: state.presets.filter((p) => p.id !== id) });
}
