"use client";

import {
  AudioLines,
  Disc3,
  FileMusic,
  Mic2,
  Music2,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";

import { LiveBadge } from "@/components/hud";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

/** Modos de referência musical (UI). */
export type RefMode = "authorial" | "score" | "artist" | "custom";

/** Formato interno quando mode === score. */
export type ScoreFormat = "midi" | "musicxml";

type RefPart = { index: number; name: string; note_count: number; id?: string };

type ComparisonEvent = {
  id: string;
  category: string;
  start_seconds: number;
  end_seconds: number;
  expected_note?: string | null;
  observed_note?: string | null;
  deviation?: number | null;
  unit?: string | null;
  confidence?: number | null;
  description: string;
  recommendation_key?: string;
};

type Recommendation = {
  key: string;
  title: string;
  text: string;
  disclaimer?: string;
};

const MODES: Array<{
  id: RefMode;
  title: string;
  description: string;
  features: string[];
  Icon: typeof Music2;
}> = [
  {
    id: "artist",
    title: "Música original do artista",
    description: "Compare com uma gravação comercial ou interpretação autorizada.",
    features: ["Voz separada da original", "Afinação e ritmo", "Transposição"],
    Icon: Disc3,
  },
  {
    id: "score",
    title: "Partitura ou MIDI",
    description: "Use MIDI ou MusicXML como melodia esperada.",
    features: ["Notas absolutas", "Partes/trilhas", "Comparação precisa"],
    Icon: FileMusic,
  },
  {
    id: "authorial",
    title: "Música autoral / Sem referência",
    description: "Análise técnica vocal independente — sem erros absolutos de afinação.",
    features: ["Afinação e estabilidade", "Vibrato e pausas", "Fraseado"],
    Icon: Mic2,
  },
  {
    id: "custom",
    title: "Referência personalizada",
    description: "Importe uma gravação-modelo (voz guia ou solo limpo).",
    features: ["Melodia da referência", "Comparação melódica", "Sem partitura"],
    Icon: AudioLines,
  },
];

type Props = {
  mode: RefMode;
  onModeChange: (m: RefMode) => void;
  scoreFormat: ScoreFormat;
  onScoreFormatChange: (f: ScoreFormat) => void;
  refFile: File | null;
  onRefFile: (f: File | null) => void;
  parts: RefPart[];
  partIndex: number | null;
  onPartIndex: (i: number | null) => void;
  acceptTransposition: boolean;
  onAcceptTransposition: (v: boolean) => void;
  toleranceCents: number;
  onToleranceCents: (v: number) => void;
  canCompare: boolean;
  comparing: boolean;
  preparingArtist?: boolean;
  error: string | null;
  onCompare: () => void;
  onListParts: () => void;
  events: ComparisonEvent[];
  recommendations: Recommendation[];
  alignmentSummary: string | null;
  referenceQuality?: string | null;
  onSeek: (sec: number) => void;
  canCreateReference?: boolean;
  creatingReference?: boolean;
  onCreateReference?: () => void;
  savedReferences?: Array<{ id: string; title: string; noteCount: number; updatedAt: string }>;
  onLoadSavedReference?: (id: string) => void;
  onDeleteSavedReference?: (id: string) => void;
};

export function VoiceCheckReferencePanel({
  mode,
  onModeChange,
  scoreFormat,
  onScoreFormatChange,
  refFile,
  onRefFile,
  parts,
  partIndex,
  onPartIndex,
  acceptTransposition,
  onAcceptTransposition,
  toleranceCents,
  onToleranceCents,
  canCompare,
  comparing,
  preparingArtist = false,
  error,
  onCompare,
  onListParts,
  events,
  recommendations,
  alignmentSummary,
  referenceQuality,
  onSeek,
  canCreateReference = false,
  creatingReference = false,
  onCreateReference,
  savedReferences = [],
  onLoadSavedReference,
  onDeleteSavedReference,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const needsImport = mode === "artist" || mode === "score" || mode === "custom";
  const accept =
    mode === "score"
      ? scoreFormat === "midi"
        ? ".mid,.midi,audio/midi"
        : ".musicxml,.xml,application/vnd.recordare.musicxml+xml,text/xml"
      : "audio/*,.wav,.mp3,.flac,.m4a,.ogg,.aac,.mp4,.mov";

  const pickLabel =
    mode === "score"
      ? scoreFormat === "midi"
        ? refFile
          ? "Trocar MIDI"
          : "Selecionar MIDI"
        : refFile
          ? "Trocar MusicXML"
          : "Selecionar MusicXML"
      : mode === "artist"
        ? refFile
          ? "Trocar música original"
          : "Importar música original"
        : refFile
          ? "Trocar gravação-modelo"
          : "Importar gravação-modelo";

  const compareBusy = comparing || preparingArtist;
  const compareLabel = compareBusy
    ? mode === "artist"
      ? "Separando e comparando…"
      : "Comparando…"
    : mode === "artist"
      ? "Comparar com original"
      : mode === "score"
        ? scoreFormat === "midi"
          ? "Comparar com MIDI"
          : "Comparar com MusicXML"
        : "Comparar com modelo";

  return (
    <section className="space-y-5 panel-glass rounded-2xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold text-ink">Referência musical</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Opcional. Sem referência: análise técnica observável. Com referência: comparação de
            afinação, ritmo e melodia.
          </p>
        </div>
        {comparing ? <LiveBadge label="Comparando" /> : null}
      </div>

      <div
        className="grid gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Modo de referência musical"
      >
        {MODES.map(({ id, title, description, features, Icon }) => {
          const selected = mode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onModeChange(id)}
              className={cn(
                "group flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-colors",
                selected
                  ? "border-accent/55 bg-accent/10 shadow-[0_0_0_1px_rgba(45,212,191,0.12)]"
                  : "border-line/80 bg-canvas/20 hover:border-line hover:bg-canvas/40",
              )}
            >
              <div className="flex w-full items-start gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                    selected
                      ? "border-accent/40 bg-accent/15 text-accent"
                      : "border-line bg-canvas-raised text-ink-muted",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-semibold leading-snug",
                      selected ? "text-accent" : "text-ink",
                    )}
                  >
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p>
                </div>
              </div>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {features.map((f) => (
                  <li
                    key={f}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-xs font-medium tracking-wide",
                      selected
                        ? "bg-accent/15 text-accent"
                        : "bg-canvas-raised text-ink-faint",
                    )}
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {mode === "authorial" ? (
        <div className="rounded-xl border border-line/60 bg-canvas/25 px-3 py-3 text-sm text-ink-muted">
          <p className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>
              Análise técnica independente: atividade vocal, F0, estabilidade, intensidade,
              vibrato, pausas e fraseado. Sem erros absolutos de afinação.
            </span>
          </p>
        </div>
      ) : null}

      {mode === "score" ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Formato da partitura">
          {(
            [
              ["midi", "MIDI"],
              ["musicxml", "MusicXML"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                onScoreFormatChange(id);
                onRefFile(null);
              }}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                scoreFormat === id
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-line text-ink-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {needsImport ? (
        <div className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setLocalErr(null);
              onRefFile(f);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              {pickLabel}
            </Button>
            {refFile && mode === "score" ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => void onListParts()}>
                {scoreFormat === "midi" ? "Listar trilhas" : "Listar partes"}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={!canCompare || compareBusy || !refFile}
              onClick={onCompare}
            >
              {compareLabel}
            </Button>
          </div>
          {refFile ? (
            <p className="text-data text-xs text-ink-faint">{refFile.name}</p>
          ) : null}

          {mode === "artist" ? (
            <p className="text-xs text-ink-faint">
              O áudio será preparado com FFmpeg e a voz isolada localmente (Demucs), quando
              disponível. Separação fraca gera aviso — comparação usa confiança reduzida.
            </p>
          ) : null}
          {mode === "custom" ? (
            <p className="text-xs text-ink-faint">
              Prefira gravação monofônica limpa. Polifonia ou ruído reduzem a confiança da
              segmentação.
            </p>
          ) : null}

          {parts.length > 0 && mode === "score" ? (
            <div className="space-y-1">
              <Label htmlFor="ref-part" className="text-xs text-ink-faint">
                {scoreFormat === "midi" ? "Trilha" : "Parte"}
              </Label>
              <select
                id="ref-part"
                className="h-9 w-full max-w-md rounded-lg border border-line bg-canvas-raised px-2 text-sm"
                value={partIndex ?? ""}
                onChange={(e) =>
                  onPartIndex(e.target.value === "" ? null : Number(e.target.value))
                }
              >
                <option value="">Automática (mais notas)</option>
                {parts.map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.index}: {t.name} ({t.note_count} notas)
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="tol-ref" className="text-xs text-ink-faint">
              Tolerância afinação ±{toleranceCents}¢
            </Label>
            <input
              id="tol-ref"
              type="range"
              min={20}
              max={100}
              step={5}
              value={toleranceCents}
              onChange={(e) => onToleranceCents(Number(e.target.value))}
              className="h-3 w-full max-w-md accent-[var(--accent)]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={acceptTransposition}
              onChange={(e) => onAcceptTransposition(e.target.checked)}
            />
            Aceitar transposição detectada e recalcular
          </label>

          {referenceQuality ? (
            <p className="rounded-xl border border-line/50 bg-canvas/20 px-3 py-2 text-xs text-ink-muted">
              Qualidade da referência:{" "}
              <span className="text-data text-ink">{referenceQuality}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {onCreateReference ? (
        <div className="space-y-2 border-t border-line/50 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canCreateReference || creatingReference}
              onClick={onCreateReference}
            >
              <Music2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {creatingReference ? "Extraindo melodia…" : "Criar referência da minha gravação"}
            </Button>
            <p className="text-xs text-ink-faint">
              Extrai melodia → corrige notas → salva e reutiliza (ou abre no Laboratório).
            </p>
          </div>
          {savedReferences.length > 0 && onLoadSavedReference ? (
            <div className="space-y-1.5">
              <p className="hud-label">
                Referências salvas
              </p>
              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {savedReferences.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/60 px-2.5 py-1.5 text-sm"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-ink hover:text-accent"
                      onClick={() => onLoadSavedReference(r.id)}
                    >
                      {r.title}
                      <span className="ml-2 text-data text-xs text-ink-faint">
                        {r.noteCount} notas
                      </span>
                    </button>
                    {onDeleteSavedReference ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-signal-err"
                        onClick={() => onDeleteSavedReference(r.id)}
                      >
                        Excluir
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {(error || localErr) && (
        <p role="alert" className="text-sm text-signal-err">
          {error || localErr}
        </p>
      )}

      {alignmentSummary ? (
        <p className="rounded-xl border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-ink-muted">
          {alignmentSummary}
        </p>
      ) : null}

      {events.length > 0 ? (
        <div className="space-y-2">
          <p className="hud-label">Ocorrências</p>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {events.map((ev) => (
              <li key={ev.id} className="rounded-xl border border-line/70 px-3 py-2 text-sm">
                <button
                  type="button"
                  className="text-data text-xs text-accent hover:underline"
                  onClick={() => onSeek(Math.max(0, ev.start_seconds - 0.1))}
                >
                  {formatClock(ev.start_seconds)} · {ev.category}
                  {ev.deviation != null
                    ? ` · ${ev.deviation}${ev.unit === "cents" ? "¢" : ev.unit ? ` ${ev.unit}` : ""}`
                    : ""}
                </button>
                <p className="mt-1 text-xs text-ink-muted">{ev.description}</p>
                <p className="mt-0.5 text-data text-xs text-ink-faint">
                  {ev.expected_note ? `ref ${ev.expected_note}` : ""}
                  {ev.observed_note ? ` · obs ${ev.observed_note}` : ""}
                  {ev.confidence != null ? ` · confiança ${Math.round(ev.confidence * 100)}%` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recommendations.length > 0 ? (
        <div className="space-y-2">
          <p className="hud-label">
            Recomendações
          </p>
          <ul className="space-y-2">
            {recommendations.map((r) => (
              <li key={r.key} className="rounded-xl border border-accent/25 bg-accent/5 px-3 py-2">
                <p className="text-sm font-medium text-ink">{r.title}</p>
                <p className="mt-1 text-xs text-ink-muted">{r.text}</p>
                {r.disclaimer ? (
                  <p className="mt-1 text-xs text-ink-faint">{r.disclaimer}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
