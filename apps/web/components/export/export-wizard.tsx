"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckSquare,
  Download,
  FolderOpen,
  Layers,
  MicOff,
  Music2,
  Package,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ExportSteps } from "@/components/export/export-steps";
import { CoverArt } from "@/components/library/cover-art";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EXPORT_MODES,
  defaultStemMix,
  estimateExportBytes,
  formatAllowed,
  hasEnoughDisk,
  progressFromStatus,
  runMixdownExport,
  runStemExports,
  runZipExport,
  sanitizeFilename,
  type ExportFormat,
  type ExportMode,
  type ExportPhase,
} from "@/lib/export-job";
import { formatBytes, formatDuration, statusLabel as jobStatusLabel } from "@/lib/format";
import {
  projectsApi,
  studioApi,
  systemApi,
  type StemMixState,
  type StemRow,
} from "@/lib/api";
import { STEM_COLORS, STEM_LABELS, STEM_ORDER } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";

type Props = { projectId: string };

const MODE_ICONS = {
  stem: Music2,
  all_tracks: Package,
  custom_mix: SlidersHorizontal,
  minus_instrument: MicOff,
} as const;

export function ExportWizard({ projectId }: Props) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<ExportMode>("all_tracks");
  const [format, setFormat] = useState<ExportFormat>("zip");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [muteTarget, setMuteTarget] = useState("other");
  const [filename, setFilename] = useState("");
  const [normalize, setNormalize] = useState(false);
  const [includeMeta, setIncludeMeta] = useState(true);
  const [phase, setPhase] = useState<ExportPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [lastConfig, setLastConfig] = useState<Record<string, unknown> | null>(null);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectsApi.get(projectId),
  });
  const stemsQuery = useQuery({
    queryKey: ["stems", projectId],
    queryFn: () => studioApi.stems(projectId),
  });
  const assetsQuery = useQuery({
    queryKey: ["project-assets", projectId],
    queryFn: () => projectsApi.assets(projectId),
  });
  const mixQuery = useQuery({
    queryKey: ["mix", projectId],
    queryFn: () => studioApi.getMix(projectId),
  });
  const system = useQuery({
    queryKey: ["system-status"],
    queryFn: () => systemApi.status(),
  });

  const latestStems = useMemo(() => {
    const items = stemsQuery.data?.items ?? [];
    const byType = new Map<string, StemRow>();
    for (const s of items) {
      if (!byType.has(s.stem_type)) byType.set(s.stem_type, s);
    }
    return STEM_ORDER.map((t) => byType.get(t)).filter(Boolean) as StemRow[];
  }, [stemsQuery.data]);

  const assetById = useMemo(() => {
    const map = new Map<string, { size_bytes: number; duration_ms: number | null }>();
    for (const a of assetsQuery.data?.items ?? []) {
      map.set(a.id, { size_bytes: a.size_bytes, duration_ms: a.duration_ms });
    }
    return map;
  }, [assetsQuery.data]);

  useEffect(() => {
    if (latestStems.length && selected.size === 0) {
      setSelected(new Set(latestStems.map((s) => s.stem_type)));
    }
  }, [latestStems, selected.size]);

  useEffect(() => {
    if (project.data?.name && !filename) {
      setFilename(project.data.name);
    }
  }, [project.data?.name, filename]);

  const modeMeta = EXPORT_MODES.find((m) => m.id === mode)!;
  const allSizes = latestStems.map((s) => assetById.get(s.asset_id)?.size_bytes ?? 0);
  const selectedSizes = latestStems
    .filter((s) => selected.has(s.stem_type))
    .map((s) => assetById.get(s.asset_id)?.size_bytes ?? 0);
  const estimate = estimateExportBytes(mode, format, selectedSizes, allSizes);
  const disk = hasEnoughDisk(system.data?.disk_free_bytes, estimate);

  function pickMode(next: ExportMode) {
    setMode(next);
    const meta = EXPORT_MODES.find((m) => m.id === next)!;
    setFormat(meta.defaultFormat);
    setError(null);
  }

  function toggleStem(type: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(type)) n.delete(type);
      else n.add(type);
      return n;
    });
  }

  function selectAll(on: boolean) {
    setSelected(on ? new Set(latestStems.map((s) => s.stem_type)) : new Set());
  }

  function summaryLines(): string[] {
    const lines: string[] = [`Modo: ${modeMeta.title}`, `Formato: ${format.toUpperCase()}`];
    if (mode === "stem") {
      lines.push(`Faixas: ${[...selected].map((t) => STEM_LABELS[t] ?? t).join(", ") || "—"}`);
    } else if (mode === "all_tracks") {
      lines.push(
        format === "zip"
          ? `Pacote ZIP com ${latestStems.length} faixas (WAV)`
          : `WAV separados: ${[...selected].map((t) => STEM_LABELS[t] ?? t).join(", ") || "nenhuma"}`,
      );
    } else if (mode === "custom_mix") {
      lines.push(
        `Mix · faixas ativas: ${[...selected].map((t) => STEM_LABELS[t] ?? t).join(", ") || "silêncio"}`,
      );
    } else {
      lines.push(`Sem instrumento: ${STEM_LABELS[muteTarget] ?? muteTarget} muted`);
    }
    const fileExt = format === "zip" ? "zip" : format;
    lines.push(`Arquivo: ${sanitizeFilename(filename || "export", fileExt)}`);
    if (normalize) lines.push("Normalizar áudio: ainda não disponível — exportado no volume original");
    if (includeMeta) lines.push("Metadados: nome do arquivo no download do navegador");
    return lines;
  }

  async function executeExport() {
    setError(null);
    setLastUrl(null);
    setPhase("preparing");
    setProgress(8);
    setStatusLabel("Preparando exportação…");
    setStep(4);

    const config = {
      mode,
      format,
      selected: [...selected],
      muteTarget,
      filename,
      normalize,
      includeMeta,
    };
    setLastConfig(config);

    try {
      if (!disk.ok) throw new Error(disk.reason || "Espaço insuficiente");
      if (!formatAllowed(mode, format)) {
        throw new Error(`Formato ${format.toUpperCase()} indisponível para este modo`);
      }

      const base = filename || project.data?.name || "export";
      const audioFmt = format === "mp3" ? "mp3" : "wav";
      let url: string | null = null;

      if (mode === "stem" || (mode === "all_tracks" && (format === "wav" || format === "mp3"))) {
        const types = [...selected];
        if (!types.length) throw new Error("Selecione ao menos uma faixa");
        setPhase("queued");
        const urls = await runStemExports(
          projectId,
          types,
          base,
          (job) => {
            setStatusLabel(`Exportando faixa · ${jobStatusLabel(job.status)}`);
            setPhase(job.status === "processing" ? "processing" : "queued");
            setProgress(progressFromStatus(job.status, "processing"));
          },
          audioFmt,
        );
        url = urls[urls.length - 1] ?? null;
      } else if (mode === "all_tracks" && format === "zip") {
        setPhase("queued");
        url = await runZipExport(
          projectId,
          base,
          (job) => {
            setStatusLabel(`Gerando ZIP · ${jobStatusLabel(job.status)}`);
            setPhase(job.status === "processing" ? "processing" : "queued");
            setProgress(progressFromStatus(job.status, "processing"));
          },
          "wav",
        );
      } else {
        // mixdown paths
        const types = latestStems.map((s) => s.stem_type);
        const prev = mixQuery.data?.state ?? {
          stems: defaultStemMix(types),
          master_gain: 1,
        };
        const stems: Record<string, StemMixState> = { ...defaultStemMix(types), ...prev.stems };
        for (const t of types) {
          const cur = stems[t] ?? { volume: 1, mute: false, solo: false, pan: 0 };
          if (mode === "custom_mix") {
            stems[t] = { ...cur, mute: !selected.has(t), solo: false };
          } else {
            stems[t] = { ...cur, mute: t === muteTarget, solo: false };
          }
        }
        setPhase("queued");
        setStatusLabel("Preparando o mix…");
        url = await runMixdownExport(
          projectId,
          base,
          { stems, master_gain: prev.master_gain ?? 1 },
          prev,
          (job) => {
            setStatusLabel(`Gerando o mix · ${jobStatusLabel(job.status)}`);
            setPhase(job.status === "processing" ? "processing" : "queued");
            setProgress(progressFromStatus(job.status, "processing"));
          },
          audioFmt,
        );
      }

      setPhase("downloading");
      setProgress(95);
      setStatusLabel("Download iniciado no navegador");
      setLastUrl(url);
      setPhase("done");
      setProgress(100);
      setStatusLabel("Exportação concluída");
    } catch (e) {
      setPhase("error");
      setProgress(0);
      setError(friendlyError(e, "Falha na exportação"));
      setStatusLabel("Erro — seleção preservada");
    }
  }

  if (project.isLoading || stemsQuery.isLoading) {
    return <PageSkeleton label="Carregando exportação…" />;
  }

  if (!latestStems.length) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-canvas-raised p-6">
        <h1 className="font-display text-xl font-semibold text-ink">Nada para exportar ainda</h1>
        <p className="text-sm text-ink-muted">Separe as faixas desta música primeiro — depois é só voltar aqui.</p>
        <Link href={`/projects/${projectId}#separacao`} className="text-sm font-medium text-accent hover:underline">
          Ir para a separação
        </Link>
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-canvas-raised/90 p-4 shadow-panel">
        <CoverArt seed={projectId} title={project.data?.name} className="h-14 w-14 rounded-xl text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-ink md:text-[1.75rem]">
            {project.data?.name ?? "Projeto"}
          </h1>
          <p className="truncate text-sm text-ink-muted">
            {project.data?.description || "Sem artista"} · {latestStems.length} faixas
            {project.data?.bpm ? ` · ${project.data.bpm} BPM` : ""}
            {project.data?.musical_key ? ` · ${project.data.musical_key}` : ""}
          </p>
        </div>
      </header>

      <ExportSteps current={step} />

      {error ? (
        <p role="alert" className="rounded-xl border border-signal-err/40 bg-signal-err/10 px-3 py-2 text-sm text-signal-err">
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <section className="space-y-3" aria-label="Modo de exportação">
          <p className="text-sm text-ink-muted">Escolha o que deseja exportar.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {EXPORT_MODES.map((m) => {
              const Icon = MODE_ICONS[m.id];
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickMode(m.id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition-colors",
                    active
                      ? "border-accent/60 bg-accent/10 shadow-glow"
                      : "border-line bg-canvas-raised/80 hover:border-accent/30",
                  )}
                  aria-pressed={active}
                >
                  <Icon className={cn("mb-2 h-5 w-5", active ? "text-accent" : "text-violet")} aria-hidden />
                  <p className="font-semibold text-ink">{m.title}</p>
                  <p className="mt-1 text-xs text-ink-muted">{m.description}</p>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" onClick={() => setStep(2)}>
              Continuar
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-5" aria-label="Trilhas e formato">
          <div>
            <h2 className="text-sm font-semibold text-ink">Formato</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["wav", "mp3", "zip"] as ExportFormat[]).map((f) => {
                const ok = formatAllowed(mode, f);
                return (
                  <button
                    key={f}
                    type="button"
                    disabled={!ok}
                    onClick={() => ok && setFormat(f)}
                    className={cn(
                      "min-w-[5.5rem] rounded-lg border px-4 py-3 text-sm font-medium",
                      format === f && ok
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-line text-ink-muted",
                      !ok && "cursor-not-allowed opacity-40",
                    )}
                    title={!ok ? `Não disponível para ${modeMeta.title}` : undefined}
                    aria-pressed={format === f}
                  >
                    {f.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {mode === "minus_instrument" ? (
            <div>
              <Label htmlFor="mute-stem">Instrumento a silenciar</Label>
              <select
                id="mute-stem"
                className="mt-1 h-10 w-full max-w-xs rounded-lg border border-line bg-canvas px-3 text-sm text-ink"
                value={muteTarget}
                onChange={(e) => setMuteTarget(e.target.value)}
              >
                {latestStems.map((s) => (
                  <option key={s.stem_type} value={s.stem_type}>
                    {STEM_LABELS[s.stem_type] ?? s.stem_type}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">Selecionar faixas</h2>
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={selected.size === latestStems.length}
                    onChange={(e) => selectAll(e.target.checked)}
                  />
                  Todas as faixas
                </label>
              </div>
              {mode === "all_tracks" && format === "zip" ? (
                <p className="mb-2 text-xs text-ink-faint">
                  O ZIP do worker inclui todos os stems do projeto (seleção visual).
                </p>
              ) : null}
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-canvas/50">
                {latestStems.map((s) => {
                  const meta = assetById.get(s.asset_id);
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(s.stem_type)}
                        onChange={() => toggleStem(s.stem_type)}
                        aria-label={STEM_LABELS[s.stem_type] ?? s.stem_type}
                      />
                      <span
                        className="h-8 w-1.5 rounded-full"
                        style={{ background: STEM_COLORS[s.stem_type] ?? "#20D9D2" }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{STEM_LABELS[s.stem_type] ?? s.stem_type}</p>
                        <p className="font-mono text-xs text-ink-faint">
                          {formatDuration(meta?.duration_ms)} · {formatBytes(meta?.size_bytes)}
                        </p>
                      </div>
                      <CheckSquare
                        className={cn(
                          "h-4 w-4",
                          selected.has(s.stem_type) ? "text-accent" : "text-ink-faint",
                        )}
                        aria-hidden
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp-name">Nome do arquivo</Label>
              <Input
                id="exp-name"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Pasta de destino</Label>
              <p className="mt-1 rounded-xl border border-dashed border-line bg-canvas/40 px-3 py-2 text-sm text-ink-muted">
                Download do navegador · escolha de pasta nativa{" "}
                <span className="text-ink-faint">disponível só no aplicativo para computador</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={normalize}
                onChange={(e) => setNormalize(e.target.checked)}
              />
              Normalizar áudio
              <span className="text-xs text-ink-faint">(em breve)</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={includeMeta}
                onChange={(e) => setIncludeMeta(e.target.checked)}
              />
              Incluir metadados no nome do arquivo
            </label>
          </div>

          <p className="text-xs text-ink-faint">
            Estimativa ~{formatBytes(estimate)}
            {system.data?.disk_free_bytes != null
              ? ` · disco livre ${formatBytes(system.data.disk_free_bytes)}`
              : ""}
            {!disk.ok ? (
              <span className="text-signal-err"> · {disk.reason}</span>
            ) : null}
          </p>

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button type="button" onClick={() => setStep(3)} disabled={!disk.ok}>
              Revisar
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4 rounded-2xl border border-line bg-canvas-raised/90 p-5 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">Resumo do que será exportado</h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-ink-muted">
            {summaryLines().map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {!disk.ok ? (
            <p className="text-sm text-signal-err">{disk.reason}</p>
          ) : (
            <p className="text-xs text-ink-faint">Espaço estimado OK · ~{formatBytes(estimate)}</p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button type="button" onClick={() => void executeExport()} disabled={!disk.ok}>
              <Download className="h-4 w-4" aria-hidden />
              Confirmar exportação
            </Button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="space-y-5 rounded-2xl border border-line bg-canvas-raised/90 p-5 shadow-panel">
          <h2 className="text-sm font-semibold text-ink">Progresso</h2>
          <div
            className="h-3 overflow-hidden rounded-full bg-canvas"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da exportação"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-ink-muted" role="status">
            {progress}% · {statusLabel}
          </p>

          {phase === "done" ? (
            <p className="text-sm text-accent">Arquivo pronto. Se o download não abriu, use Abrir pasta/URL.</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!lastUrl}
              onClick={() => lastUrl && window.open(lastUrl, "_blank")}
            >
              <FolderOpen className="h-4 w-4" aria-hidden />
              Abrir pasta / URL
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={phase === "queued" || phase === "processing" || phase === "preparing"}
              onClick={() => {
                if (lastConfig) {
                  setMode(lastConfig.mode as ExportMode);
                  setFormat(lastConfig.format as ExportFormat);
                  setSelected(new Set(lastConfig.selected as string[]));
                  setMuteTarget(String(lastConfig.muteTarget));
                  setFilename(String(lastConfig.filename));
                }
                void executeExport();
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Repetir exportação
            </Button>
            <Link href={`/projects/${projectId}/studio`} className={buttonVariants({ variant: "secondary" })}>
              <Layers className="h-4 w-4" aria-hidden />
              Voltar ao estúdio
            </Link>
          </div>

          {phase === "error" ? (
            <Button type="button" onClick={() => setStep(2)}>
              Ajustar seleção e tentar de novo
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
