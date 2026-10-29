import { describe, expect, it } from "vitest";

import {
  buildCatalog,
  filterCatalog,
  sortCatalog,
  type LibraryCatalogItem,
} from "@/lib/library-catalog";
import type { AudioAsset, Project } from "@/lib/api";

function project(partial: Partial<Project> & Pick<Project, "id" | "name">): Project {
  return {
    owner_id: "u1",
    description: null,
    bpm: null,
    musical_key: null,
    chords_hint: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...partial,
  };
}

function asset(
  partial: Partial<AudioAsset> & Pick<AudioAsset, "id" | "project_id" | "kind">,
): AudioAsset {
  return {
    owner_id: "u1",
    mime_type: "audio/mpeg",
    format: "mp3",
    checksum_sha256: null,
    size_bytes: 1000,
    duration_ms: 120000,
    sample_rate: 44100,
    channels: 2,
    original_filename: "track.mp3",
    status: "ready",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...partial,
  };
}

describe("library-catalog", () => {
  it("monta itens a partir de projetos e assets reais", () => {
    const items = buildCatalog(
      [project({ id: "p1", name: "Faixa A", description: "Artista X", bpm: "120", musical_key: "Am" })],
      [asset({ id: "a1", project_id: "p1", kind: "original" })],
      [
        asset({ id: "s1", project_id: "p1", kind: "stem", original_filename: "vocals.wav" }),
        asset({ id: "s2", project_id: "p1", kind: "stem", original_filename: "drums.wav" }),
      ],
    );
    expect(items).toHaveLength(1);
    const row = items[0]!;
    expect(row.artist).toBe("Artista X");
    expect(row.stemCount).toBe(2);
    expect(row.processing).toBe("ready");
    expect(row.bpm).toBe("120");
    expect(row.musicalKey).toBe("Am");
  });

  it("filtra por artista, formato e processamento", () => {
    const base: LibraryCatalogItem[] = [
      {
        projectId: "1",
        name: "Um",
        artist: "A",
        durationMs: 1000,
        bpm: "100",
        musicalKey: "C",
        stemCount: 4,
        stemTypes: [],
        format: "mp3",
        processing: "ready",
        updatedAt: "2026-10-01T00:00:00Z",
        createdAt: "2026-10-01T00:00:00Z",
        originalAssetId: "a",
        hasOriginal: true,
      },
      {
        projectId: "2",
        name: "Dois",
        artist: "B",
        durationMs: 2000,
        bpm: null,
        musicalKey: null,
        stemCount: 0,
        stemTypes: [],
        format: "wav",
        processing: "none",
        updatedAt: "2026-10-02T00:00:00Z",
        createdAt: "2026-10-02T00:00:00Z",
        originalAssetId: "b",
        hasOriginal: true,
      },
    ];
    const filtered = filterCatalog(base, {
      q: "",
      artist: "B",
      format: "wav",
      key: "",
      processing: "none",
      date: "all",
    });
    expect(filtered.map((i) => i.projectId)).toEqual(["2"]);
  });

  it("ordena por nome", () => {
    const items: LibraryCatalogItem[] = [
      {
        projectId: "1",
        name: "Zeta",
        artist: null,
        durationMs: null,
        bpm: null,
        musicalKey: null,
        stemCount: 0,
        stemTypes: [],
        format: null,
        processing: "none",
        updatedAt: "2026-01-01T00:00:00Z",
        createdAt: "2026-01-01T00:00:00Z",
        originalAssetId: null,
        hasOriginal: false,
      },
      {
        projectId: "2",
        name: "Alpha",
        artist: null,
        durationMs: null,
        bpm: null,
        musicalKey: null,
        stemCount: 0,
        stemTypes: [],
        format: null,
        processing: "none",
        updatedAt: "2026-01-02T00:00:00Z",
        createdAt: "2026-01-02T00:00:00Z",
        originalAssetId: null,
        hasOriginal: false,
      },
    ];
    expect(sortCatalog(items, "name", "asc").map((i) => i.name)).toEqual(["Alpha", "Zeta"]);
  });
});
