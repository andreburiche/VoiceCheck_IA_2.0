"use client";

import Link from "next/link";

type PracticeRoomHeaderProps = {
  projectId: string;
  projectName: string;
  profileLabel: string;
  keyLabel: string;
  bpm: number;
  timeSig?: string;
  durationSec: number;
  ready: boolean;
};

function formatClock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "—:—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PracticeRoomHeader({
  projectId,
  projectName,
  profileLabel,
  keyLabel,
  bpm,
  timeSig = "4/4",
  durationSec,
  ready,
}: PracticeRoomHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-line/70 bg-glass px-4 py-4 shadow-panel md:px-5">
      <div className="min-w-0 flex-1 space-y-2">
        <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]">
          <span className="text-ink-muted">Treino · </span>
          {projectName || "Música"}
        </h1>
        <p className="text-sm text-ink-muted">
          Pratique por trechos, ajuste velocidade e tom e grave sua voz para comparar.
        </p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-faint">
          <div>
            <dt className="inline text-ink-faint">Perfil </dt>
            <dd className="inline text-accent">{profileLabel}</dd>
          </div>
          <div>
            <dt className="inline">Tom </dt>
            <dd className="inline text-ink">{keyLabel || "—"}</dd>
          </div>
          <div>
            <dt className="inline">BPM </dt>
            <dd className="inline text-ink">{bpm || "—"}</dd>
          </div>
          <div>
            <dt className="inline">Compasso </dt>
            <dd className="inline text-ink">{timeSig}</dd>
          </div>
          <div>
            <dt className="inline">Duração </dt>
            <dd className="inline text-ink">{ready ? formatClock(durationSec) : "…"}</dd>
          </div>
        </dl>
      </div>
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex h-9 items-center justify-center rounded-xl border border-line bg-canvas-overlay px-3 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
      >
        Alterar música
      </Link>
    </header>
  );
}
