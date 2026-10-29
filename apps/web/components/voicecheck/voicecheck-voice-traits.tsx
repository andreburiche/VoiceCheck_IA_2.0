"use client";

import { useEffect, useRef } from "react";

import { LiveBadge } from "@/components/hud";
import { Button } from "@/components/ui/button";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";
import { cn } from "@/lib/utils";

type Props = {
  report: VoiceCheckF0Report | null;
  analyzing: boolean;
  error: string | null;
  canAnalyze: boolean;
  onAnalyze: () => void;
};

/**
 * Características observáveis da voz — sem pontuação de afinação / certo-errado.
 */
export function VoiceCheckVoiceTraits({
  report,
  analyzing,
  error,
  canAnalyze,
  onAnalyze,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !report?.pitch_track.length) return;
    const pts = report.pitch_track;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 480;
    const h = 160;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(12, 14, 20, 0.55)";
    ctx.fillRect(0, 0, w, h);

    const midis = pts
      .map((p) => p.midi_note)
      .filter((m): m is number => m != null && Number.isFinite(m));
    if (!midis.length) {
      ctx.fillStyle = "rgba(160,170,180,0.7)";
      ctx.font = "12px sans-serif";
      ctx.fillText("Sem trechos de voz para desenhar", 16, h / 2);
      return;
    }
    const lo = Math.min(...midis) - 1;
    const hi = Math.max(...midis) + 1;
    const t0 = pts[0]!.time_seconds;
    const t1 = pts[pts.length - 1]!.time_seconds;
    const span = Math.max(0.01, t1 - t0);
    const yOf = (m: number) => h - ((m - lo) / (hi - lo)) * (h - 16) - 8;
    const xOf = (t: number) => ((t - t0) / span) * w;

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
      const y = yOf(m);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(38, 139, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const p of pts) {
      if (!p.is_valid || p.midi_note == null) {
        started = false;
        continue;
      }
      const x = xOf(p.time_seconds);
      const y = yOf(p.midi_note);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [report]);

  return (
    <section className="space-y-4 panel-glass rounded-2xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">
            Características da sua voz
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Esta análise descreve características acústicas observadas na gravação. Para identificar
            notas cantadas incorretamente, será necessário comparar sua execução com uma referência
            musical.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {analyzing ? <LiveBadge label="Analisando" /> : null}
          <Button type="button" size="sm" disabled={!canAnalyze || analyzing} onClick={onAnalyze}>
            {analyzing ? "Analisando no servidor…" : "Analisar (motor Python)"}
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-signal-err">
          {error}
        </p>
      ) : null}

      {!report && !analyzing ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-faint">
          Prepare o WAV e execute a análise. Nenhum indicador inventado é exibido.
        </p>
      ) : null}

      {report ? (
        <>
          <div className="relative overflow-hidden rounded-xl bg-canvas/70 ring-1 ring-inset ring-ink/10">
            <div className="flex items-center justify-between border-b border-ink/10 px-3 py-2 text-data text-xs text-ink-faint">
              Curva F0 · {report.algorithm} · {report.analysis_version}
            </div>
            <canvas
              ref={canvasRef}
              className="block h-40 w-full"
              role="img"
              aria-label="Altura vocal ao longo do tempo"
            />
          </div>

          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Frequência predominante"
              value={
                report.statistics.predominant_hz != null
                  ? `${report.statistics.predominant_hz} Hz`
                  : "—"
              }
              hint={report.statistics.predominant_note_name ?? "—"}
            />
            <Stat
              label="Extensão observada"
              value={
                report.observed_range.span_semitones != null
                  ? `${report.observed_range.span_semitones} st`
                  : "—"
              }
              hint={
                report.observed_range.min_hz != null
                  ? `${report.observed_range.min_hz}–${report.observed_range.max_hz} Hz`
                  : "—"
              }
            />
            <Stat
              label="Áudio com voz aproveitado"
              value={`${report.statistics.valid_frame_percent}%`}
              hint={`${Math.round((report.statistics.valid_frames / Math.max(1, report.statistics.total_frames)) * 100)}% da gravação`}
            />
            <Stat
              label="Var. estável (¢)"
              value={
                report.statistics.stable_region_variation_cents_median != null
                  ? String(report.statistics.stable_region_variation_cents_median)
                  : "—"
              }
              hint="Não é nota de desafinação"
            />
          </dl>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-line/60 px-3 py-3">
              <p className="hud-label">
                Distribuição de notas
              </p>
              {Object.keys(report.statistics.note_histogram).length === 0 ? (
                <p className="mt-2 text-xs text-ink-muted">Sem notas válidas.</p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-data text-xs text-ink-muted">
                  {Object.entries(report.statistics.note_histogram)
                    .slice(0, 16)
                    .map(([note, n]) => (
                      <li key={note} className="flex justify-between gap-2">
                        <span className="text-ink">{note}</span>
                        <span>{n}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-line/60 px-3 py-3">
              <p className="hud-label">
                Regiões analisáveis
              </p>
              {report.analyzable_regions.length === 0 ? (
                <p className="mt-2 text-xs text-ink-muted">Nenhuma região contínua suficiente.</p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-data text-xs text-ink-muted">
                  {report.analyzable_regions.map((r) => (
                    <li key={`${r.start_seconds}-${r.end_seconds}`}>
                      {r.start_seconds.toFixed(2)}s – {r.end_seconds.toFixed(2)}s
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {report.warnings.length > 0 ? (
            <ul className="space-y-1 rounded-xl border border-signal-warn/40 bg-signal-warn/10 px-3 py-3 text-xs text-signal-warn">
              {report.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          <p className="text-xs leading-relaxed text-ink-faint">{report.disclaimer}</p>
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
    <div className={cn("rounded-xl border border-line/60 px-3 py-2")}>
      <dt className="hud-label">{label}</dt>
      <dd className="font-display text-lg font-semibold text-ink">{value}</dd>
      <p className="text-data text-xs text-ink-faint">{hint}</p>
    </div>
  );
}
