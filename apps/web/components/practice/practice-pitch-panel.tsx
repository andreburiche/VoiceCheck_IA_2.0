"use client";

import { corTema, useTemaAtivo } from "@/lib/tema";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PracticePitchAnalysis } from "@/lib/practice-pitch-analysis";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

type Props = {
  analysis: PracticePitchAnalysis | null;
  analyzing: boolean;
  error: string | null;
  toleranceCents: number;
  onToleranceChange: (cents: number) => void;
  onAnalyze: () => void;
  onSeek: (sec: number) => void;
  canAnalyze: boolean;
  takeLabel?: string | null;
};

/**
 * Aba Afinação — Fase 3: gráfico e eventos só com medições YIN reais.
 */
export function PracticePitchPanel({
  analysis,
  analyzing,
  error,
  toleranceCents,
  onToleranceChange,
  onAnalyze,
  onSeek,
  canAnalyze,
  takeLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const tema = useTemaAtivo();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis?.chartPoints.length) return;
    const pts = analysis.chartPoints;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 480;
    const h = 180;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = corTema("canvas", 0.55);
    ctx.fillRect(0, 0, w, h);

    const midis = pts
      .flatMap((p) => [p.sungMidi, p.refMidi])
      .filter((m): m is number => m != null && Number.isFinite(m));
    if (!midis.length) return;
    const lo = Math.min(...midis) - 1;
    const hi = Math.max(...midis) + 1;
    const t0 = pts[0]!.songSec;
    const t1 = pts[pts.length - 1]!.songSec;
    const span = Math.max(0.01, t1 - t0);

    const yOf = (midi: number) => h - ((midi - lo) / (hi - lo)) * (h - 16) - 8;
    const xOf = (t: number) => ((t - t0) / span) * w;

    // Grade de semitons
    ctx.strokeStyle = corTema("ink", 0.06);
    ctx.lineWidth = 1;
    for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
      const y = yOf(m);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Referência (linha)
    ctx.strokeStyle = corTema("accent", 0.75);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const p of pts) {
      if (p.refMidi == null) {
        started = false;
        continue;
      }
      const x = xOf(p.songSec);
      const y = yOf(p.refMidi);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Sua voz (pontos)
    for (const p of pts) {
      if (p.sungMidi == null) continue;
      const x = xOf(p.songSec);
      const y = yOf(p.sungMidi);
      ctx.fillStyle = p.inTol
        ? corTema("brand-blue", 0.85)
        : corTema("err", 0.9);
      ctx.fillRect(x - 1, y - 1.5, 2, 3);
    }
  }, [analysis, tema]);

  return (
    <section
      className="space-y-4 rounded-2xl border border-line/70 bg-glass p-4 md:p-5"
      aria-labelledby="pitch-panel-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="pitch-panel-title" className="font-display text-base font-semibold text-ink">
            Análise de afinação
          </h3>
          <p className="mt-1 text-sm text-ink-muted">
            YIN no navegador (monofonia experimental). Sem % inventados — só frames com confiança
            mínima.
          </p>
          {takeLabel ? (
            <p className="mt-1 font-mono text-xs text-ink-faint">Ensaio: {takeLabel}</p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!canAnalyze || analyzing}
          onClick={onAnalyze}
        >
          {analyzing ? "Analisando…" : "Analisar ensaio"}
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tol-cents" className="text-xs text-ink-faint">
          Tolerância ±{toleranceCents} cents
        </Label>
        <input
          id="tol-cents"
          type="range"
          min={20}
          max={100}
          step={5}
          value={toleranceCents}
          onChange={(e) => onToleranceChange(Number(e.target.value))}
          className="h-3 w-full max-w-md accent-[var(--accent)]"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-signal-err">
          {error}
        </p>
      ) : null}

      {!analysis && !analyzing ? (
        <div
          className="flex h-44 items-center justify-center rounded-xl border border-dashed border-line/80 bg-canvas/50 px-4 text-center text-sm text-ink-faint"
          role="status"
        >
          Selecione um ensaio no player e clique em Analisar. Referência: partitura do Lab Vocal (se
          houver) ou stem de voz Demucs.
        </div>
      ) : null}

      {analysis ? (
        <>
          <div
            className="overflow-hidden rounded-xl border border-line/70 bg-canvas/70"
            role="img"
            aria-label="Gráfico de afinação: sua voz e a referência"
          >
            <div className="flex flex-wrap gap-3 border-b border-line/40 px-3 py-1.5 font-mono text-xs text-ink-faint">
              <span className="text-accent">— referência</span>
              <span className="text-violet">● sua voz (ok)</span>
              <span className="text-signal-err">● fora da tolerância</span>
              <span>
                {analysis.refSource === "lab_notes" ? "Referência: Laboratório vocal" : "Referência: voz separada"}
              </span>
            </div>
            <canvas ref={canvasRef} className="block h-[180px] w-full" />
          </div>

          <dl className="grid gap-2 sm:grid-cols-3">
            <Stat
              label="Dentro da tolerância"
              value={
                analysis.inTolerancePct != null ? `${analysis.inTolerancePct}%` : "—"
              }
              hint="Com base nos trechos em que havia voz"
            />
            <Stat
              label="Desvios de afinação"
              value={String(analysis.pitchEvents.length)}
              hint={`tol ±${analysis.toleranceCents}¢`}
            />
            <Stat
              label="Desvios de ritmo"
              value={String(analysis.rhythmEvents.length)}
              hint={`tol ±${analysis.rhythmTolMs} ms`}
            />
          </dl>

          <EventList
            title="Ocorrências de afinação"
            events={analysis.pitchEvents}
            onSeek={onSeek}
          />
          <EventList
            title="Ocorrências de ritmo"
            events={analysis.rhythmEvents}
            onSeek={onSeek}
          />
        </>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-line/60 px-3 py-2">
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="font-display text-lg font-semibold text-ink">{value}</dd>
      <p className="font-mono text-xs text-ink-faint">{hint}</p>
    </div>
  );
}

function EventList({
  title,
  events,
  onSeek,
}: {
  title: string;
  events: PracticePitchAnalysis["pitchEvents"];
  onSeek: (sec: number) => void;
}) {
  if (!events.length) {
    return (
      <div className="rounded-xl border border-dashed border-line/70 px-3 py-3">
        <p className="text-xs font-medium text-ink-faint">{title}</p>
        <p className="mt-1 text-xs text-ink-muted">
          Nenhum desvio persistente acima da confiança mínima — ou dados insuficientes.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-ink-faint">{title}</p>
      <ul className="space-y-2">
        {events.map((ev) => (
          <li
            key={ev.id}
            className={cn(
              "rounded-xl border px-3 py-2.5 text-sm",
              ev.type === "pitch" ? "border-signal-err/35 bg-signal-err/5" : "border-signal-warn/35 bg-signal-warn/5",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="font-mono text-xs text-accent hover:underline"
                onClick={() => onSeek(Math.max(0, ev.songSec - 0.15))}
              >
                {formatClock(ev.songSec)}
                {ev.endSec != null ? `–${formatClock(ev.endSec)}` : ""}
              </button>
              <span className="font-mono text-xs text-ink-faint">
                conf. {Math.round(ev.confidence * 100)}% · {ev.measured}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{ev.explanation}</p>
            <p className="mt-1 font-mono text-xs text-ink-faint">
              ref {ev.refNote}
              {ev.sungNote ? ` · cantado ≈ ${ev.sungNote}` : ""} · {ev.kind}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
