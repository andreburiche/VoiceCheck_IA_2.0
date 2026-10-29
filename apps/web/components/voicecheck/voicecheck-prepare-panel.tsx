"use client";

import { Loader2, ShieldCheck, Waves } from "lucide-react";
import type { ReactNode } from "react";

import { LiveBadge } from "@/components/hud";
import { Button } from "@/components/ui/button";
import { VoiceCheckPlayer } from "@/components/voicecheck/voicecheck-player";
import { formatBytes, type VoiceCheckAssetMeta, type VoiceCheckProbeLocal } from "@/lib/voicecheck-store";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

type Props = {
  asset: VoiceCheckAssetMeta | null;
  originalUrl: string | null;
  preparedUrl: string | null;
  probe: VoiceCheckProbeLocal | null;
  preparing: boolean;
  error: string | null;
  onPrepare: () => void;
  onContinue: () => void;
  onBack: () => void;
  /** Bloco da separação da voz (IA), mostrado abaixo do probe. */
  isolation?: ReactNode;
  /** false enquanto a voz não estiver pronta para análise. */
  canContinue?: boolean;
  /** Rótulo do segundo player (ex.: "Voz isolada (IA)"). */
  preparedLabel?: string;
};

export function VoiceCheckPreparePanel({
  asset,
  originalUrl,
  preparedUrl,
  probe,
  preparing,
  error,
  onPrepare,
  onContinue,
  onBack,
  isolation,
  canContinue = true,
  preparedLabel = "WAV preparado",
}: Props) {
  const ready = Boolean(preparedUrl && probe);
  const continueOk = ready && canContinue;

  return (
    <section className="panel-glass space-y-5 rounded-2xl p-4 md:p-5" aria-labelledby="vc-prepare-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="vc-prepare-title" className="font-display text-xl font-semibold text-ink">
            Preparar áudio
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Validação local (ffprobe) e extração para WAV interno mono 44.1 kHz via FFmpeg. O arquivo
            original no seu disco / IndexedDB não é modificado.
          </p>
        </div>
        {preparing ? (
          <LiveBadge label="Extraindo" />
        ) : (
          <LiveBadge label={ready ? "WAV pronto" : "Aguardando"} active={false} />
        )}
      </div>

      {asset ? (
        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-ink/10 sm:grid-cols-3">
          <Readout label="Arquivo" value={asset.name} />
          <Readout label="Tamanho" value={formatBytes(asset.sizeBytes)} />
          <Readout label="Tipo" value={`${asset.kind} · ${asset.ext.toUpperCase()}`} />
        </dl>
      ) : (
        <p className="rounded-xl bg-signal-warn/10 px-3 py-2 text-sm text-signal-warn">
          Volte e importe um arquivo primeiro.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!asset || preparing} onClick={onPrepare}>
          {preparing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Waves className="h-4 w-4" aria-hidden />
          )}
          {preparing ? "Extraindo…" : ready ? "Reextrair áudio" : "Validar e extrair áudio"}
        </Button>
        <Button type="button" variant="secondary" onClick={onBack}>
          Voltar
        </Button>
        <Button type="button" variant={continueOk ? "default" : "secondary"} disabled={!continueOk} onClick={onContinue}>
          Continuar para analisar
        </Button>
      </div>

      {preparing ? (
        <div className="relative h-1 overflow-hidden rounded-full bg-ink/10" aria-hidden>
          <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-flare animate-hud-sweep" />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-signal-err/10 px-3 py-2 text-sm text-signal-err">
          {error}
        </p>
      ) : null}

      {probe ? (
        <div className="rounded-xl bg-accent/[0.06] p-3 ring-1 ring-inset ring-accent/25">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-accent">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Probe · {probe.source === "ffprobe" ? "ffprobe" : "decodificador do navegador"}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-ink/10 md:grid-cols-5">
            <Readout
              label="Duração"
              value={probe.durationMs != null ? formatClock(probe.durationMs / 1000) : "—"}
            />
            <Readout label="Sample rate" value={probe.sampleRate != null ? `${probe.sampleRate} Hz` : "—"} />
            <Readout label="Canais" value={probe.channels != null ? `${probe.channels} ch` : "—"} />
            <Readout
              label="Codec"
              value={`${probe.audioCodec ?? "—"}${probe.videoCodec ? ` / ${probe.videoCodec}` : ""}`}
            />
            <Readout
              label="Faixas"
              value={`${probe.hasAudio ? "áudio" : "—"}${probe.hasVideo ? " + vídeo" : ""}`}
            />
          </dl>
          {probe.formatName ? (
            <p className="text-data mt-2 text-xs text-ink-faint">container: {probe.formatName}</p>
          ) : null}
        </div>
      ) : null}

      {isolation}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="hud-label mb-2">Original · prévia</p>
          <VoiceCheckPlayer objectUrl={originalUrl} asset={asset} />
        </div>
        <div>
          <p className="hud-label mb-2">{preparedLabel}</p>
          {preparedUrl ? (
            <VoiceCheckPlayer
              objectUrl={preparedUrl}
              asset={{
                name: "Áudio preparado",
                mimeType: "audio/wav",
                sizeBytes: 0,
                durationSec: probe?.durationMs != null ? probe.durationMs / 1000 : null,
                kind: "audio",
                ext: "wav",
              }}
            />
          ) : (
            <p
              className={cn(
                "rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink-faint",
                preparing && "border-flare/40 text-flare-soft",
              )}
            >
              {preparing ? "Extraindo WAV interno…" : "Ainda sem WAV interno — rode a extração."}
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        A voz é separada dos instrumentos com IA (Demucs) antes da análise. Vídeo exige FFmpeg na
        API; áudio puro pode usar fallback no navegador se a API estiver offline.
      </p>
    </section>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-canvas-raised/90 px-3 py-2.5">
      <dt className="hud-label">{label}</dt>
      <dd className="text-data mt-1 truncate text-sm text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}
