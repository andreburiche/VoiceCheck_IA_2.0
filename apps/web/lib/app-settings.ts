/**
 * Preferências locais (localStorage) — app local-first, funciona offline.
 * Preferência de dispositivo NÃO altera SEPARATION_ADAPTER do servidor.
 */

export type DevicePreference = "auto" | "gpu" | "cpu";
export type UpdateChannel = "stable" | "beta";

export type AppSettings = {
  /** Preferência de inferência (local). Adapter real vem do servidor. */
  devicePreference: DevicePreference;
  /** deviceId de saída (enumerateDevices) ou "" = padrão do SO */
  audioOutputId: string;
  audioOutputLabel: string;
  defaultVolume: number; // 0..1
  reducedMotion: boolean;
  compactUi: boolean;
  showWaveformGlow: boolean;
  updateChannel: UpdateChannel;
  lastUpdateCheckAt: string | null;
  lastHardwareTestAt: string | null;
  lastHardwareTestNotes: string[];
};

export const APP_VERSION = "0.1.0";
export const SETTINGS_KEY = "estudio_musical_app_settings_v1";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  devicePreference: "auto",
  audioOutputId: "",
  audioOutputLabel: "Padrão do sistema",
  defaultVolume: 0.85,
  reducedMotion: false,
  compactUi: false,
  showWaveformGlow: false,
  updateChannel: "stable",
  lastUpdateCheckAt: null,
  lastHardwareTestAt: null,
  lastHardwareTestNotes: [],
};

export function loadAppSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_APP_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_APP_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyAppearance(settings);
}

export function applyAppearance(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // o tema (claro/escuro/sistema) tem preferência própria: lib/tema.ts
  root.classList.toggle("reduce-motion", settings.reducedMotion);
  root.classList.toggle("compact-ui", settings.compactUi);
  // Brilho em formas de onda foi retirado (DESIGN.md: "No Glow Rule")
  root.classList.remove("waveform-glow");
}

export function devicePreferenceAllowed(
  pref: DevicePreference,
  gpuAvailable: boolean | undefined,
): { ok: boolean; reason?: string } {
  if (pref === "gpu" && !gpuAvailable) {
    return { ok: false, reason: "Não há placa de vídeo (GPU) disponível neste servidor." };
  }
  return { ok: true };
}

export type OutputDevice = { deviceId: string; label: string };

export async function listAudioOutputs(): Promise<OutputDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    // Alguns browsers só revelam labels após permissão
    await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      s.getTracks().forEach((t) => t.stop());
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audiooutput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Saída ${i + 1}`,
    }));
}

export type ClientAudioProbe = {
  sampleRate: number | null;
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
  sinkIdSupported: boolean;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
};

export async function probeClientAudio(): Promise<ClientAudioProbe> {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const out: ClientAudioProbe = {
    sampleRate: null,
    baseLatencyMs: null,
    outputLatencyMs: null,
    sinkIdSupported: false,
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    deviceMemoryGb: (nav as Navigator & { deviceMemory?: number })?.deviceMemory ?? null,
  };
  if (typeof window === "undefined") return out;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return out;
  const ctx = new AC();
  try {
    out.sampleRate = ctx.sampleRate;
    out.baseLatencyMs =
      typeof ctx.baseLatency === "number" ? Math.round(ctx.baseLatency * 1000) : null;
    const ol = (ctx as AudioContext & { outputLatency?: number }).outputLatency;
    out.outputLatencyMs = typeof ol === "number" ? Math.round(ol * 1000) : null;
    out.sinkIdSupported = typeof (ctx as AudioContext & { setSinkId?: unknown }).setSinkId === "function";
  } finally {
    await ctx.close().catch(() => undefined);
  }
  return out;
}

export function resolveEffectiveDevice(
  preference: DevicePreference,
  adapter: string | undefined,
  gpuAvailable: boolean | undefined,
): { effective: "gpu" | "cpu" | "contract"; note: string } {
  const a = (adapter || "").toLowerCase();
  if (a.includes("contract")) {
    return { effective: "contract", note: "Servidor em adapter contract (smoke)." };
  }
  if (preference === "auto") {
    if (a.includes("gpu") || gpuAvailable) {
      return { effective: "gpu", note: "Automático → GPU (quando adapter/CUDA permitir)." };
    }
    return { effective: "cpu", note: "Automático → CPU." };
  }
  if (preference === "gpu") {
    if (gpuAvailable || a.includes("gpu")) {
      return { effective: "gpu", note: "Preferência GPU." };
    }
    return { effective: "cpu", note: "GPU pedida, mas indisponível — fallback lógico CPU (adapter do .env manda)." };
  }
  return { effective: "cpu", note: "Preferência CPU." };
}
