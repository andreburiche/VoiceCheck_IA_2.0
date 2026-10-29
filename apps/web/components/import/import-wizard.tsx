"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Music2, Upload } from "lucide-react";

import { ModelCards } from "@/components/import/model-cards";
import { PreviewWaveform } from "@/components/import/preview-waveform";
import { WizardSteps } from "@/components/import/wizard-steps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractWaveformPeaks } from "@/lib/audio-preview";
import {
  projectsApi,
  separationsApi,
  sha256Hex,
  systemApi,
  uploadsApi,
  type AudioAsset,
  type ProcessingJob,
} from "@/lib/api";
import { formatBytes, formatDuration } from "@/lib/format";
import {
  IMPORT_ACCEPT,
  detectFormat,
  guessMime,
  readAudioDurationMs,
  validateImportFile,
} from "@/lib/import-file";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

type ImportWizardProps = {
  projectId: string;
  projectName?: string;
  onComplete?: (result: { asset: AudioAsset; job: ProcessingJob }) => void;
};

type Step = 1 | 2 | 3 | 4;

export function ImportWizard({ projectId, projectName, onComplete }: ImportWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [modelCode, setModelCode] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);

  const sys = useQuery({
    queryKey: ["system-status"],
    queryFn: () => systemApi.status(),
    staleTime: 30_000,
  });

  const maxBytes = sys.data?.max_upload_bytes ?? 104_857_600;
  const models = sys.data?.models ?? [];
  const selectable = useMemo(() => models.filter((m) => m.selectable), [models]);

  useEffect(() => {
    if (modelCode) return;
    const first = selectable[0];
    if (first) setModelCode(first.code);
  }, [selectable, modelCode]);

  const applyFile = useCallback(
    async (f: File) => {
      setError(null);
      const check = validateImportFile(f, { maxBytes });
      if (!check.ok) {
        setError(check.message);
        return;
      }
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
      setPhase("Lendo metadados…");
      const [dur, wave] = await Promise.all([readAudioDurationMs(f), extractWaveformPeaks(f, 72)]);
      setDurationMs(dur);
      setPeaks(wave);
      setPhase(null);
      setStep(2);
    },
    [maxBytes, title],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void applyFile(f);
    },
    [applyFile],
  );

  function goNext() {
    setError(null);
    if (step === 2) {
      if (!title.trim()) {
        setError("Informe o título.");
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      const m = models.find((x) => x.code === modelCode);
      if (!m?.selectable) {
        setError("Selecione um modelo instalado e compatível.");
        return;
      }
      setStep(4);
    }
  }

  async function startSeparation() {
    if (!file || !modelCode) return;
    if (!rights) {
      setError("Confirme que você tem direito de uso da obra.");
      return;
    }
    const m = models.find((x) => x.code === modelCode);
    if (!m?.selectable) {
      setError("Modelo indisponível.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setPhase("Salvando informações da música…");
      await projectsApi.update(projectId, {
        name: title.trim(),
        description: artist.trim() || undefined,
        chords_hint: album.trim() ? `album:${album.trim()}` : undefined,
      });

      setPhase("Preparando o arquivo…");
      const checksum = await sha256Hex(file);
      setPhase("Iniciando upload…");
      const init = await uploadsApi.initiate({
        project_id: projectId,
        filename: file.name,
        mime_type: file.type || guessMime(file.name),
        size_bytes: file.size,
        checksum_sha256: checksum,
        rights_confirmed: true,
      });
      setPhase("Enviando arquivo…");
      await uploadsApi.putFile(init.upload_url, file);
      setPhase("Conferindo o arquivo…");
      const asset = await uploadsApi.complete({
        asset_id: init.asset_id,
        checksum_sha256: checksum,
      });
      setPhase("Iniciando a separação…");
      const job = await separationsApi.create(
        projectId,
        { source_asset_id: asset.id, model_code: modelCode, params: {} },
        `import-${projectId}-${asset.id}-${Date.now()}`,
      );
      setPhase("Separação iniciada.");
      onComplete?.({ asset, job });
    } catch (err) {
      setError(friendlyError(err, "Não foi possível importar este arquivo. Tente de novo."));
      setPhase(null);
    } finally {
      setBusy(false);
    }
  }

  const format = file ? detectFormat(file.name, file.type || guessMime(file.name)) : null;
  const selectedModel = models.find((m) => m.code === modelCode) ?? null;

  return (
    <section
      id="importar"
      className="space-y-5 scroll-mt-24 rounded-2xl border border-line bg-canvas-raised/90 p-5 shadow-panel md:p-6"
      aria-labelledby="import-wizard-title"
    >
      <div className="space-y-3">
        <h2 id="import-wizard-title" className="text-xl font-semibold text-ink">
          Assistente de importação
        </h2>
        <p className="text-sm text-ink-muted">
          MP3, WAV, FLAC ou MP4
          {projectName ? ` · música “${projectName}”` : ""}
        </p>
        <WizardSteps current={step} />
      </div>

      {sys.data?.using_contract_silence ? (
        <p
          role="status"
          className="rounded-xl border border-signal-warn/40 bg-signal-warn/10 px-3 py-2 text-sm text-signal-warn"
        >
          Modo de teste ativo: a separação vai gerar faixas em silêncio, sem separar o áudio de verdade.
        </p>
      ) : null}

      {step === 1 ? (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              document.getElementById("import-file-input")?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => document.getElementById("import-file-input")?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all",
            dragOver
              ? "border-accent bg-accent/10 shadow-glow"
              : "border-accent/35 bg-canvas/40 hover:border-accent hover:bg-accent/5",
          )}
        >
          <input
            id="import-file-input"
            type="file"
            accept={IMPORT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void applyFile(f);
            }}
          />
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Music2 className="h-7 w-7" aria-hidden />
          </span>
          {file ? (
            <>
              <p className="text-base font-medium text-ink">{file.name}</p>
              <p className="text-sm text-ink-muted">
                {formatBytes(file.size)}
                {durationMs != null ? ` · ${formatDuration(durationMs)}` : ""} — clique para trocar
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-medium text-ink">Arraste e solte sua música aqui</p>
              <p className="text-sm text-ink-muted">ou clique para selecionar</p>
            </>
          )}
          <p className="text-xs text-ink-faint">
            MP3 · MP4 · WAV · FLAC · máx. {formatBytes(maxBytes)}
          </p>
        </div>
      ) : null}

      {step === 2 && file ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-medium text-ink">{file.name}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
              <div>
                <dt className="text-ink-faint">Duração</dt>
                <dd className="font-mono text-ink">{formatDuration(durationMs)}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Tamanho</dt>
                <dd className="font-mono text-ink">{formatBytes(file.size)}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Formato</dt>
                <dd className="font-mono uppercase text-ink">{format}</dd>
              </div>
            </dl>
            <PreviewWaveform peaks={peaks} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
              Trocar arquivo
            </Button>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="imp-title">Título</Label>
              <Input id="imp-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imp-artist">Artista</Label>
              <Input id="imp-artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imp-album">Álbum</Label>
              <Input id="imp-album" value={album} onChange={(e) => setAlbum(e.target.value)} />
            </div>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        sys.isLoading ? (
          <p className="text-sm text-ink-muted">Carregando modelos instalados…</p>
        ) : models.length === 0 ? (
          <p role="alert" className="text-sm text-signal-err">
            Nenhum modelo de separação disponível agora. Tente de novo em instantes ou fale com o administrador.
          </p>
        ) : (
          <ModelCards
            models={models}
            selectedCode={modelCode}
            onSelect={setModelCode}
            gpuAvailable={sys.data?.gpu_available}
            cpuCount={sys.data?.cpu_count}
          />
        )
      ) : null}

      {step === 4 && file ? (
        <div className="space-y-4 rounded-2xl border border-line bg-canvas/50 p-4">
          <h3 className="text-sm font-semibold text-ink">Resumo</h3>
          <ul className="space-y-1 text-sm text-ink-muted">
            <li>
              Arquivo: <span className="text-ink">{file.name}</span> ({formatBytes(file.size)})
            </li>
            <li>
              Título: <span className="text-ink">{title}</span>
              {artist ? ` · ${artist}` : ""}
              {album ? ` · ${album}` : ""}
            </li>
            <li>
              Modelo:{" "}
              <span className="text-accent">{selectedModel?.label ?? modelCode}</span>
              {selectedModel ? ` · ${selectedModel.stems.length} faixas` : ""}
            </li>
            <li>
              Dispositivo:{" "}
              <span className="text-ink">
                {sys.data?.gpu_available ? "GPU" : "CPU"}
                {sys.data?.using_contract_silence ? " · modo de teste" : ""}
              </span>
            </li>
          </ul>
          <label className="flex items-start gap-3 text-sm text-ink-muted">
            <input
              type="checkbox"
              className="mt-1"
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
            />
            <span>
              Confirmo que tenho direito de uso desta obra e que o conteúdo não contorna DRM.
            </span>
          </label>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-signal-err">
          {error}
        </p>
      ) : null}
      {phase ? <p className="text-sm text-accent" role="status">{phase}</p> : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy || step === 1}
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
        >
          Voltar
        </Button>
        <div className="flex gap-2">
          {step < 4 ? (
            <Button type="button" onClick={goNext} disabled={step === 1 && !file}>
              Próximo
            </Button>
          ) : (
            <Button type="button" onClick={() => void startSeparation()} disabled={busy || !rights}>
              <Upload className="h-4 w-4" aria-hidden />
              {busy ? "Processando…" : "Iniciar Separação"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
