import type { AudioAsset, Project } from "@/lib/api";

export type ProcessingFilter = "all" | "ready" | "none" | "pending" | "failed";

export type LibraryCatalogItem = {
  projectId: string;
  name: string;
  artist: string | null;
  durationMs: number | null;
  bpm: string | null;
  musicalKey: string | null;
  stemCount: number;
  stemTypes: string[];
  format: string | null;
  processing: Exclude<ProcessingFilter, "all">;
  updatedAt: string;
  createdAt: string;
  originalAssetId: string | null;
  hasOriginal: boolean;
};

export function buildCatalog(
  projects: Project[],
  originals: AudioAsset[],
  stems: AudioAsset[],
): LibraryCatalogItem[] {
  return projects.map((project) => {
    const projectOriginals = originals.filter((a) => a.project_id === project.id);
    const projectStems = stems.filter((a) => a.project_id === project.id);
    const main = projectOriginals[0] ?? null;
    const stemTypes = Array.from(
      new Set(
        projectStems
          .map((s) => {
            const fromName = s.original_filename?.match(/(vocals|drums|bass|other)/i)?.[1];
            return (fromName ?? s.kind)?.toLowerCase();
          })
          .filter(Boolean),
      ),
    );

    let processing: LibraryCatalogItem["processing"] = "none";
    if (projectStems.some((s) => s.status === "ready") || projectStems.length > 0) {
      processing = "ready";
    } else if (main?.status === "failed") {
      processing = "failed";
    } else if (main && ["uploading", "processing", "pending"].includes(main.status)) {
      processing = "pending";
    } else if (main?.status === "ready" && projectStems.length === 0) {
      processing = "none";
    }

    const updatedCandidates = [
      project.updated_at,
      ...projectOriginals.map((a) => a.updated_at),
      ...projectStems.map((a) => a.updated_at),
    ].filter(Boolean);
    const updatedAt = updatedCandidates.sort().at(-1) ?? project.updated_at;

    return {
      projectId: project.id,
      name: project.name,
      artist: project.description?.trim() || null,
      durationMs: main?.duration_ms ?? null,
      bpm: project.bpm,
      musicalKey: project.musical_key,
      stemCount: projectStems.length,
      stemTypes,
      format: main?.format ?? null,
      processing,
      updatedAt,
      createdAt: project.created_at,
      originalAssetId: main?.id ?? null,
      hasOriginal: projectOriginals.length > 0,
    };
  });
}

export type LibraryFilterState = {
  q: string;
  artist: string;
  format: string;
  key: string;
  processing: ProcessingFilter;
  date: "all" | "7d" | "30d" | "365d";
};

export function filterCatalog(
  items: LibraryCatalogItem[],
  filters: LibraryFilterState,
  opts?: { favoriteIds?: Set<string>; collectionIds?: Set<string> | null },
): LibraryCatalogItem[] {
  const q = filters.q.trim().toLowerCase();
  const now = Date.now();
  const dateMs =
    filters.date === "7d"
      ? 7 * 864e5
      : filters.date === "30d"
        ? 30 * 864e5
        : filters.date === "365d"
          ? 365 * 864e5
          : null;

  return items.filter((item) => {
    if (opts?.collectionIds && !opts.collectionIds.has(item.projectId)) return false;
    if (opts?.favoriteIds && !opts.favoriteIds.has(item.projectId)) return false;

    if (q) {
      const hay = `${item.name} ${item.artist ?? ""} ${item.format ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.artist && (item.artist ?? "") !== filters.artist) return false;
    if (filters.format && (item.format ?? "").toLowerCase() !== filters.format.toLowerCase()) {
      return false;
    }
    if (filters.key && (item.musicalKey ?? "") !== filters.key) return false;
    if (filters.processing !== "all" && item.processing !== filters.processing) return false;
    if (dateMs != null) {
      const t = Date.parse(item.updatedAt);
      if (Number.isNaN(t) || now - t > dateMs) return false;
    }
    return true;
  });
}

export function sortCatalog(
  items: LibraryCatalogItem[],
  sortKey: "updated" | "name" | "artist" | "duration" | "bpm",
  sortDir: "asc" | "desc",
): LibraryCatalogItem[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = a.name.localeCompare(b.name, "pt-BR");
        break;
      case "artist":
        cmp = (a.artist ?? "").localeCompare(b.artist ?? "", "pt-BR");
        break;
      case "duration":
        cmp = (a.durationMs ?? -1) - (b.durationMs ?? -1);
        break;
      case "bpm":
        cmp = Number(a.bpm ?? -1) - Number(b.bpm ?? -1);
        break;
      default:
        cmp = Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
    }
    return cmp * dir;
  });
}

export function uniqueArtists(items: LibraryCatalogItem[]): string[] {
  return Array.from(new Set(items.map((i) => i.artist).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

export function uniqueFormats(items: LibraryCatalogItem[]): string[] {
  return Array.from(new Set(items.map((i) => i.format).filter(Boolean) as string[])).sort();
}

export function uniqueKeys(items: LibraryCatalogItem[]): string[] {
  return Array.from(new Set(items.map((i) => i.musicalKey).filter(Boolean) as string[])).sort();
}
