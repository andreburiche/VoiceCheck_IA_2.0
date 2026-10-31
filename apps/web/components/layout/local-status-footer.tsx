"use client";

import { useQuery } from "@tanstack/react-query";

import { systemApi, usageApi } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Barra de telemetria local (CPU, GPU, disco, áudio) no rodapé do app. */
export function LocalStatusFooter() {
  const status = useQuery({
    queryKey: ["system-status"],
    queryFn: () => systemApi.status(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const usage = useQuery({
    queryKey: ["usage"],
    queryFn: () => usageApi.me(),
    staleTime: 30_000,
  });

  const cpu = status.data?.cpu_count;
  const gpu = status.data?.gpu_available;
  const free = status.data?.disk_free_bytes;
  const total = status.data?.disk_total_bytes;
  const usedAudio = usage.data?.storage_bytes_used;

  return (
    <footer
      className="border-t border-ink/[0.06] bg-canvas/60 px-4 py-2.5 backdrop-blur md:px-6"
      aria-label="Recursos locais"
    >
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-ink-muted">
        <Item label="CPU" value={cpu != null ? `${cpu} núcleos` : "—"} ok={cpu != null} />
        <Item label="GPU" value={gpu ? "disponível" : "não detectada · usando CPU"} ok={!!gpu} />
        <Item
          label="Disco livre"
          value={`${formatBytes(free)}${total != null ? ` de ${formatBytes(total)}` : ""}`}
          ok={free != null}
        />
        {usedAudio != null ? (
          <li className="ml-auto text-ink-faint">
            Áudio no projeto: <span className="text-data text-ink-muted">{formatBytes(usedAudio)}</span>
          </li>
        ) : null}
      </ul>
    </footer>
  );
}

function Item({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <li className="inline-flex items-center gap-2">
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-accent" : "bg-ink-faint")} aria-hidden />
      <span className="hud-label !text-xs">{label}</span>
      <span className="text-data text-ink-muted">{value}</span>
    </li>
  );
}
