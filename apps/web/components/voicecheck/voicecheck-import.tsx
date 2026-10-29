"use client";

import { FileAudio, FileVideo, Replace, Trash2, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatBytes,
  isAllowedVoiceCheckFile,
  sniffVoiceCheckFile,
  VOICECHECK_ACCEPT,
  type VoiceCheckAssetMeta,
} from "@/lib/voicecheck-store";
import { cn } from "@/lib/utils";

type Props = {
  asset: VoiceCheckAssetMeta | null;
  objectUrl: string | null;
  onFile: (file: File, meta: VoiceCheckAssetMeta) => void;
  onClear: () => void;
  disabled?: boolean;
};

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

export function VoiceCheckImport({ asset, objectUrl, onFile, onClear, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = useCallback(
    (file: File | undefined) => {
      setError(null);
      if (!file) return;
      if (!isAllowedVoiceCheckFile(file)) {
        setError("Formato não suportado. Use MP3, WAV, FLAC, M4A, MP4 ou MOV.");
        return;
      }
      if (file.size > 2 * 1024 * 1024 * 1024) {
        setError("Arquivo acima de 2 GB.");
        return;
      }
      onFile(file, sniffVoiceCheckFile(file));
    },
    [onFile],
  );

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Zona de importação VoiceCheck"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          acceptFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "group relative flex min-h-[12rem] cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-dashed px-6 py-10 text-center transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
          dragOver
            ? "border-accent bg-accent/10"
            : "border-ink/15 bg-canvas/50 hover:border-accent/50 hover:bg-accent/[0.04]",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        {dragOver ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-accent/15 to-transparent animate-hud-sweep"
            aria-hidden
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ring-inset transition-colors duration-200",
            dragOver ? "bg-accent text-canvas ring-accent" : "bg-accent/10 text-accent ring-accent/30",
          )}
        >
          <Upload className="h-6 w-6" aria-hidden />
        </span>
        <div className="relative">
          <p className="font-display text-lg font-semibold text-ink">
            {dragOver ? "Solte para importar" : "Arraste áudio ou vídeo aqui"}
          </p>
          <p className="mt-1 text-sm text-ink-muted">ou clique para selecionar</p>
          <p className="text-data mt-3 text-xs text-ink-faint">
            MP3 · WAV · FLAC · M4A · MP4 · MOV — até 2 GB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={VOICECHECK_ACCEPT}
          disabled={disabled}
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-signal-err/10 px-3 py-2 text-sm text-signal-err">
          {error}
        </p>
      ) : null}

      {asset ? (
        <div className="panel-glass rounded-2xl p-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-inset ring-accent/25">
              {asset.kind === "video" ? (
                <FileVideo className="h-5 w-5 text-accent" aria-hidden />
              ) : (
                <FileAudio className="h-5 w-5 text-accent" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="hud-label">Arquivo carregado</p>
              <p className="mt-1 truncate font-display text-base font-semibold text-ink">{asset.name}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                <Replace className="h-3.5 w-3.5" aria-hidden />
                Substituir
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-signal-err"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remover
              </Button>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-ink/10 sm:grid-cols-4">
            <Readout label="Formato" value={asset.ext.toUpperCase() || asset.mimeType} />
            <Readout label="Tamanho" value={formatBytes(asset.sizeBytes)} />
            <Readout label="Duração" value={asset.durationSec != null ? clock(asset.durationSec) : "—"} />
            <Readout label="Tipo" value={asset.kind !== "unknown" ? asset.kind : "—"} />
          </dl>

          {objectUrl && asset.kind === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={objectUrl}
              className="mt-4 max-h-40 w-full max-w-sm rounded-lg object-cover ring-1 ring-ink/10"
              muted
              playsInline
              preload="metadata"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-canvas-raised/90 px-3 py-2.5">
      <dt className="hud-label">{label}</dt>
      <dd className="text-data mt-1 truncate text-sm text-ink">{value}</dd>
    </div>
  );
}
