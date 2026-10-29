"use client";

import { Download, Save } from "lucide-react";
import Link from "next/link";

import { CoverArt } from "@/components/library/cover-art";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatClock } from "@/lib/stem-theme";

type StudioHeaderProps = {
  projectId: string;
  title: string;
  artist?: string | null;
  bpm?: string | null;
  musicalKey?: string | null;
  durationSec: number;
  stemCount: number;
  saving?: boolean;
  onSave: () => void;
};

export function StudioHeader({
  projectId,
  title,
  artist,
  bpm,
  musicalKey,
  durationSec,
  stemCount,
  saving,
  onSave,
}: StudioHeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-line bg-canvas-raised/80 px-4 py-3 md:px-5">
      <CoverArt seed={projectId} title={title} className="h-14 w-14 rounded-xl text-base" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight text-ink md:text-xl">{title}</h1>
        <p className="truncate text-sm text-ink-muted">{artist || "Sem artista"}</p>
        <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-ink-faint">
          <div>
            <dt className="sr-only">BPM</dt>
            <dd>{bpm ? `${bpm} BPM` : "— BPM"}</dd>
          </div>
          <div>
            <dt className="sr-only">Tom</dt>
            <dd>{musicalKey || "Tom —"}</dd>
          </div>
          <div>
            <dt className="sr-only">Duração</dt>
            <dd>{formatClock(durationSec)}</dd>
          </div>
          <div>
            <dt className="sr-only">Stems</dt>
            <dd>
              {stemCount} {stemCount === 1 ? "faixa" : "faixas"}
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onSave} disabled={saving}>
          <Save className="h-4 w-4" aria-hidden />
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Link href={`/projects/${projectId}/export`} className={buttonVariants({ size: "sm" })}>
          <Download className="h-4 w-4" aria-hidden />
          Exportar
        </Link>
      </div>
    </header>
  );
}
