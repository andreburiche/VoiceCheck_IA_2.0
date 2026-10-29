/** Equalizador paramétrico 5 bandas — estado serializável (mix preset). */

export type EqBandType = "lowshelf" | "highshelf" | "peaking";

export type EqBand = {
  id: string;
  label: string;
  type: EqBandType;
  frequency: number;
  gainDb: number;
  q: number;
};

export type EqState = {
  enabled: boolean;
  bands: EqBand[];
};

export const DEFAULT_EQ_BANDS: EqBand[] = [
  { id: "low", label: "Graves", type: "lowshelf", frequency: 80, gainDb: 0, q: 0.7 },
  { id: "lowMid", label: "Méd. graves", type: "peaking", frequency: 250, gainDb: 0, q: 1 },
  { id: "mid", label: "Médios", type: "peaking", frequency: 1000, gainDb: 0, q: 1 },
  { id: "highMid", label: "Méd. agudos", type: "peaking", frequency: 4000, gainDb: 0, q: 1 },
  { id: "high", label: "Agudos", type: "highshelf", frequency: 10000, gainDb: 0, q: 0.7 },
];

export function defaultEqState(): EqState {
  return {
    enabled: true,
    bands: DEFAULT_EQ_BANDS.map((b) => ({ ...b })),
  };
}

export function normalizeEqState(raw: unknown): EqState {
  const base = defaultEqState();
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Partial<EqState>;
  const enabled = obj.enabled !== false;
  if (!Array.isArray(obj.bands) || obj.bands.length === 0) {
    return { enabled, bands: base.bands };
  }
  const bands = base.bands.map((def, i) => {
    const src = (obj.bands![i] ?? obj.bands!.find((b) => b?.id === def.id) ?? {}) as Partial<EqBand>;
    const rawGain = (src as { gainDb?: number; gain_db?: number }).gainDb
      ?? (src as { gain_db?: number }).gain_db
      ?? def.gainDb;
    const gainDb = clamp(Number(rawGain), -12, 12);
    const frequency = clamp(Number(src.frequency ?? def.frequency), 20, 20000);
    const q = clamp(Number(src.q ?? def.q), 0.1, 10);
    const type = (src.type ?? def.type) as EqBandType;
    return {
      ...def,
      type: ["lowshelf", "highshelf", "peaking"].includes(type) ? type : def.type,
      frequency,
      gainDb,
      q,
    };
  });
  return { enabled, bands };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
