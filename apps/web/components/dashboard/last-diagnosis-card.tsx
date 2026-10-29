"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AudioWaveform } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { voicecheckDiagnosesApi } from "@/lib/api";

/** Último diagnóstico vocal com dados reais — o que o usuário mediu da própria voz. */
export function LastDiagnosisCard({ className }: { className?: string }) {
  const list = useQuery({ queryKey: ["vc-diagnoses"], queryFn: () => voicecheckDiagnosesApi.list(), retry: false });
  const last = [...(list.data?.items ?? [])]
    .filter((d) => d.has_report)
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))[0];

  return (
    <section className={`panel-glass flex min-w-0 flex-col gap-4 rounded-2xl p-5 ${className ?? ""}`} aria-labelledby="last-diag-t">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="last-diag-t" className="font-display text-base font-semibold text-ink">
            Último diagnóstico vocal
          </h2>
          {last ? (
            <p className="truncate text-sm text-ink-muted" title={last.title}>
              {last.title} · {new Date(last.updated_at).toLocaleDateString("pt-BR")}
            </p>
          ) : null}
        </div>
        <AudioWaveform className="h-5 w-5 shrink-0 text-accent" aria-hidden />
      </div>

      {list.isLoading ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : last?.summary ? (
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className="hud-label">Ocorrências</dt>
            <dd className={`text-data mt-1 text-xl sm:text-2xl font-semibold ${last.summary.events > 0 ? "text-flare-soft" : "text-ink"}`}>
              {last.summary.events}
            </dd>
          </div>
          <div>
            <dt className="hud-label">Pontos positivos</dt>
            <dd className="text-data mt-1 text-xl sm:text-2xl font-semibold text-accent">{last.summary.positives}</dd>
          </div>
          <div>
            <dt className="hud-label">Voz aproveitada</dt>
            <dd className="text-data mt-1 text-xl sm:text-2xl font-semibold text-ink">
              {last.summary.valid_frame_percent != null ? `${Math.round(last.summary.valid_frame_percent)}%` : "—"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-ink-muted">
          Envie uma gravação cantando e veja, nota por nota, onde a afinação sai do lugar e o que treinar.
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        <Link href="/voicecheck" className={buttonVariants({ size: "sm", variant: last ? "secondary" : "default" })}>
          {last ? "Abrir diagnósticos" : "Fazer o primeiro diagnóstico"}
        </Link>
        {last ? (
          <Link href="/ajuda#resultados" className={buttonVariants({ size: "sm", variant: "ghost" })}>
            Como ler os números
          </Link>
        ) : null}
      </div>
    </section>
  );
}
