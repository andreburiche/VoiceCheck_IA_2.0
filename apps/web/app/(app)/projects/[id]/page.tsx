"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ImportWizard } from "@/components/import/import-wizard";
import { ProjectModules } from "@/components/project/project-modules";
import { SeparationPanel } from "@/components/processing/separation-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { projectsApi, type ProcessingJob } from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/format";
import { StatusPill } from "@/components/ui/status-pill";
import { friendlyError } from "@/lib/errors";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const [lastJobId, setLastJobId] = useState<string | null>(null);

  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectsApi.get(id),
  });
  const assets = useQuery({
    queryKey: ["project-assets", id],
    queryFn: () => projectsApi.assets(id),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash !== "#separacao" && hash !== "#importar") return;
    const target = hash.slice(1);
    const t = window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => window.clearTimeout(t);
  }, [project.data?.id]);

  if (project.isLoading) {
    return <div className="page-shell space-y-4" aria-busy="true"><div className="h-36 animate-pulse rounded-2xl bg-ink/[0.035]" /><div className="h-64 animate-pulse rounded-2xl bg-ink/[0.035]" /></div>;
  }
  if (project.isError || !project.data) {
    return (
      <p role="alert" className="text-sm text-signal-err">
        {friendlyError(project.error) ?? "Projeto não encontrado"}
      </p>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <header className="panel-glass rounded-2xl p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">
              {project.data.name}
            </h1>
            {project.data.description ? (
              <p className="mt-2 max-w-2xl text-ink-muted">{project.data.description}</p>
            ) : (
              <p className="mt-2 text-sm text-ink-faint">
                Escolha uma ferramenta abaixo para trabalhar nesta música.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${id}/studio`} className={buttonVariants({ size: "sm" })}>
              Abrir no estúdio
            </Link>
            <Link href={`/projects/${id}/practice`} className={buttonVariants({ size: "sm", variant: "secondary" })}>
              Treinar
            </Link>
          </div>
        </div>
      </header>

      {/* Sem áudio, as ferramentas não têm o que abrir: a importação vem primeiro */}
      {(assets.data?.items.length ?? 0) > 0 ? <ProjectModules projectId={id} /> : null}

      <ImportWizard
        projectId={id}
        projectName={project.data.name}
        onComplete={({ job }: { job: ProcessingJob }) => {
          setLastJobId(job.id);
          void qc.invalidateQueries({ queryKey: ["project", id] });
          void qc.invalidateQueries({ queryKey: ["project-assets", id] });
          void qc.invalidateQueries({ queryKey: ["assets"] });
          void qc.invalidateQueries({ queryKey: ["projects"] });
          window.setTimeout(() => {
            document.getElementById("separacao")?.scrollIntoView({ behavior: "smooth" });
          }, 150);
        }}
      />

      <SeparationPanel
        projectId={id}
        assets={assets.data?.items ?? []}
        highlightJobId={lastJobId}
        trackName={project.data.name}
      />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-ink">Arquivos enviados</h2>
        {assets.isLoading ? <div className="h-16 animate-pulse rounded-xl bg-ink/[0.035]" aria-hidden /> : null}
        {assets.data?.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-faint">
            Nenhum arquivo enviado ainda. Use a importação acima para enviar o áudio desta música.
          </div>
        ) : null}
        <ul className="panel-glass divide-y divide-line/80 overflow-hidden rounded-xl">
          {assets.data?.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="text-ink">{a.original_filename ?? a.id}</p>
                <p className="text-data text-xs text-ink-faint">
                  {a.format.toUpperCase()} · {formatDuration(a.duration_ms)}
                </p>
              </div>
              <span className="flex items-center gap-2">
                <StatusPill status={a.status} />
                <span className="text-data text-xs text-ink-muted">{formatBytes(a.size_bytes)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
