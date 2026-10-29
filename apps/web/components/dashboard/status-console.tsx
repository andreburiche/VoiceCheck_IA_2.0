"use client";

import { useQuery } from "@tanstack/react-query";

import { LiveBadge, MeterBar, Panel } from "@/components/hud";
import { usageApi } from "@/lib/api";
import { formatBytes } from "@/lib/format";

/** Uso do plano: minutos de separação, armazenamento e processamentos (dados reais da API). */
export function StatusConsole({ className }: { className?: string }) {
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => usageApi.me(), refetchInterval: 15_000 });

  const u = usage.data;
  const jobs = u?.concurrent_jobs ?? 0;
  const minutesUsed = Number(u?.minutes_used ?? 0);
  const minutesMax = u?.max_minutes_month ?? 0;
  const storageMax = (u?.max_storage_mb ?? 0) * 1024 * 1024;

  return (
    <Panel
      className={className}
      title="Uso do plano"
      subtitle={u ? `Plano ${u.plan_name} · ${u.period_ym}` : "Carregando…"}
      aside={
        <span role="status" aria-live="polite">
          <LiveBadge
            active={jobs > 0}
            label={jobs > 0 ? `${jobs} em processamento` : "Ocioso"}
          />
        </span>
      }
    >
      <div className="space-y-4">
        <MeterBar label="Minutos de separação" used={Math.round(minutesUsed)} total={minutesMax} />
        <MeterBar
          label="Armazenamento"
          used={u?.storage_bytes_used ?? 0}
          total={storageMax}
          format={(n) => formatBytes(n)}
        />
        <p className="border-t border-line/60 pt-3 text-sm text-ink-muted">
          {jobs > 0
            ? `${jobs} de ${u?.max_concurrent_jobs ?? "—"} processamentos simultâneos em uso.`
            : `Até ${u?.max_concurrent_jobs ?? "—"} processamentos ao mesmo tempo no seu plano.`}
        </p>
      </div>
    </Panel>
  );
}
