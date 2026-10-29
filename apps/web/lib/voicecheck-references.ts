/**
 * Referências musicais salvas localmente (IndexedDB) para reutilizar no VoiceCheck.
 */

import type { MidiNoteEvent } from "@/lib/midi-export";
import { notesToMidiBlob } from "@/lib/midi-export";

const DB_NAME = "estudio_musical_voicecheck";
const DB_VERSION = 3;
const REF_STORE = "references";

export type VoiceCheckSavedReference = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceProjectId?: string | null;
  format: "midi";
  noteCount: number;
  /** Notas editáveis (fonte da verdade). */
  notes: MidiNoteEvent[];
  /** MIDI gerado a partir de notes. */
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("Falha DB VoiceCheck refs"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(REF_STORE)) {
        db.createObjectStore(REF_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("analysis_snapshots")) {
        db.createObjectStore("analysis_snapshots", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("devolutivas")) {
        db.createObjectStore("devolutivas", { keyPath: "id" });
      }
    };
  });
}

export function createReferenceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `vcr_${Date.now()}`;
}

export async function saveVoiceCheckReference(
  input: {
    id?: string;
    title: string;
    notes: MidiNoteEvent[];
    sourceProjectId?: string | null;
  },
): Promise<VoiceCheckSavedReference> {
  const notes = input.notes.filter((n) => n.durationSec >= 0.05).slice(0, 500);
  if (notes.length < 1) throw new Error("Referência sem notas válidas");
  const now = new Date().toISOString();
  const id = input.id ?? createReferenceId();
  const existing = input.id ? await getVoiceCheckReference(input.id) : null;
  const row: VoiceCheckSavedReference = {
    id,
    title: input.title.trim() || "Referência MIDI",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sourceProjectId: input.sourceProjectId ?? existing?.sourceProjectId ?? null,
    format: "midi",
    noteCount: notes.length,
    notes,
    blob: notesToMidiBlob(notes),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REF_STORE, "readwrite");
    tx.objectStore(REF_STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return row;
}

export async function listVoiceCheckReferences(): Promise<
  Array<Omit<VoiceCheckSavedReference, "blob" | "notes"> & { noteCount: number }>
> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(REF_STORE, "readonly");
      const req = tx.objectStore(REF_STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result as VoiceCheckSavedReference[]) ?? [];
        resolve(
          rows
            .map(({ blob: _b, notes: _n, ...meta }) => meta)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        );
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function getVoiceCheckReference(
  id: string,
): Promise<VoiceCheckSavedReference | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REF_STORE, "readonly");
    const req = tx.objectStore(REF_STORE).get(id);
    req.onsuccess = () => resolve((req.result as VoiceCheckSavedReference) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVoiceCheckReference(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(REF_STORE, "readwrite");
    tx.objectStore(REF_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function referenceToMidiFile(ref: VoiceCheckSavedReference): File {
  const name = `${ref.title.replace(/[^\w\-]+/g, "_").slice(0, 48) || "referencia"}.mid`;
  return new File([ref.blob], name, { type: "audio/midi" });
}
