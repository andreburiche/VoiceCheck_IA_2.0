export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function formatHours(seconds: number): string {
  if (!seconds) return "0h";
  const h = seconds / 3600;
  if (h < 0.1) return `${Math.round(seconds / 60)} min`;
  return `${h.toFixed(1)}h`;
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ready: "Pronto",
    uploading: "Enviando",
    processing: "Processando",
    queued: "Na fila",
    failed: "Falhou",
    completed: "Concluído",
    pending: "Pendente",
    none: "Sem separação",
  };
  return map[status] ?? status;
}
