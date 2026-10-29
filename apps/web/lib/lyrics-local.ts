/**
 * Letras manuais por projeto (IndexedDB).
 * Linhas opcionalmente sincronizadas por tempo — sem ASR.
 */

const DB_NAME = "estudio_musical_lyrics";
const DB_VERSION = 1;
const STORE = "kv";

export type LyricLine = {
  id: string;
  text: string;
  /** Início da linha em ms (opcional). */
  startMs: number | null;
  sectionId?: string | null;
};

export type LyricsDoc = {
  projectId: string;
  title: string;
  body: string;
  lines: LyricLine[];
  updatedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Falha DB letras"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });
}

export function createLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ly_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyLyrics(projectId: string): LyricsDoc {
  return {
    projectId,
    title: "",
    body: "",
    lines: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Converte texto livre (uma linha = uma estrofe/verso) em LyricLine[]. */
export function bodyToLines(body: string, existing?: LyricLine[]): LyricLine[] {
  const texts = body.replace(/\r\n/g, "\n").split("\n");
  return texts.map((text, i) => {
    const prev = existing?.[i];
    return {
      id: prev?.id ?? createLineId(),
      text,
      startMs: prev?.startMs ?? null,
      sectionId: prev?.sectionId ?? null,
    };
  });
}

export function linesToBody(lines: LyricLine[]): string {
  return lines.map((l) => l.text).join("\n");
}

/** Linha ativa no tempo atual (última com startMs <= t). */
export function activeLineIndex(lines: LyricLine[], timeMs: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i]?.startMs;
    if (s != null && s <= timeMs) idx = i;
  }
  return idx;
}

export async function loadLyrics(projectId: string): Promise<LyricsDoc> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(projectId);
      req.onsuccess = () => {
        const v = req.result as LyricsDoc | undefined;
        if (!v) {
          resolve(emptyLyrics(projectId));
          return;
        }
        resolve({
          ...emptyLyrics(projectId),
          ...v,
          lines: Array.isArray(v.lines) ? v.lines : bodyToLines(v.body || ""),
        });
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return emptyLyrics(projectId);
  }
}

export async function saveLyrics(doc: LyricsDoc): Promise<void> {
  const payload: LyricsDoc = {
    ...doc,
    updatedAt: new Date().toISOString(),
  };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(payload, doc.projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* memória local já usada pelo caller */
  }
}

export function lyricsToTxt(doc: LyricsDoc): string {
  const header = [doc.title.trim() || "Letras", ""].join("\n");
  if (doc.lines.some((l) => l.startMs != null)) {
    const timed = doc.lines
      .map((l) => {
        if (l.startMs == null) return l.text;
        const sec = l.startMs / 1000;
        const m = Math.floor(sec / 60);
        const s = (sec % 60).toFixed(2).padStart(5, "0");
        return `[${m}:${s}] ${l.text}`;
      })
      .join("\n");
    return `${header}${timed}\n`;
  }
  return `${header}${doc.body || linesToBody(doc.lines)}\n`;
}
