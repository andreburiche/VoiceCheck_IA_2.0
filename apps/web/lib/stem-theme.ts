export const STEM_ORDER = ["vocals", "drums", "bass", "guitar", "piano", "other", "instrumental"] as const;

export type StemTypeId = (typeof STEM_ORDER)[number];

/** Cores fixas por faixa — iguais às do DESIGN.md (stem-*). */
export const STEM_COLORS: Record<string, string> = {
  vocals: "#20D9D2",
  drums: "#268BFF",
  bass: "#3DDB8A",
  other: "#94A3B8",
  instrumental: "#268BFF",
  guitar: "#F0A05A",
  piano: "#5FA9FF",
  keys: "#5FA9FF",
};

export const STEM_LABELS: Record<string, string> = {
  vocals: "Voz",
  drums: "Bateria",
  bass: "Baixo",
  other: "Outros",
  instrumental: "Instrumental",
  no_vocals: "Instrumental",
  guitar: "Guitarra",
  piano: "Piano",
  keys: "Teclas",
};

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const r = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${(m % 60).toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  }
  return `${m}:${r.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}
