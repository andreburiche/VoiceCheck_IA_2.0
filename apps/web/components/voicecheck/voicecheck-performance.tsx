"use client";

import { useMemo } from "react";

import { Panel, RingGauge, Sparkline, Stat } from "@/components/hud";
import type { VoiceCheckF0Report } from "@/lib/voicecheck-f0-analysis";

/**
 * Painel de métricas da voz (estilo telemetria). Só exibe o que o relatório
 * já calculou — campos ausentes viram "—", nada é estimado aqui.
 */
export function VoiceCheckPerformance({ report }: { report: VoiceCheckF0Report }) {
  const contour = useMemo(() => {
    const valid = (report.pitch_track ?? []).filter(
      (p) => p.is_valid && p.midi_note != null && Number.isFinite(p.midi_note),
    );
    if (valid.length < 2) return [];
    const target = 64;
    const step = Math.max(1, Math.floor(valid.length / target));
    const out: number[] = [];
    for (let i = 0; i < valid.length; i += step) {
      const note = valid[i]?.midi_note;
      if (note != null) out.push(Math.round(note * 10) / 10);
    }
    return out;
  }, [report.pitch_track]);

  const stats = report.statistics;
  const range = report.observed_range;
  const events = report.events?.length ?? 0;
  const pitchTol = report.comparison?.pitch?.within_tolerance_percent;
  const meanCents = report.comparison?.pitch?.mean_abs_cents;
  const rhythmTol = report.comparison?.rhythm?.within_tolerance_percent;
  const hasReference = Boolean(report.comparison) && !report.no_reference;
  const validPct = stats.valid_frame_percent;

  const mainRatio = hasReference && pitchTol != null ? pitchTol / 100 : validPct / 100;
  const mainLabel = hasReference && pitchTol != null ? "Afinação na tolerância" : "Frames com voz válida";

  return (
    <Panel
      title="Resumo da voz"
      subtitle={`${formatDuration(report.duration_seconds)} analisados · ${report.processing_engine ?? report.algorithm}`}
      aside={
        events > 0 ? (
          <span className="text-data rounded-full bg-flare/15 px-2.5 py-1 text-xs text-flare-soft">
            {events} ocorrência{events === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-data rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent">
            sem ocorrências
          </span>
        )
      }
    >
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4 rounded-xl bg-ink/[0.03] p-4 ring-1 ring-inset ring-ink/5">
          <RingGauge value={mainRatio} size={104} stroke={9} warnAt={2} label={mainLabel}>
            <span className="text-data text-2xl font-semibold text-ink">
              {Math.round(mainRatio * 100)}
              <span className="text-sm text-ink-muted">%</span>
            </span>
          </RingGauge>
          <div className="min-w-0">
            <p className="hud-label">{mainLabel}</p>
            <p className="mt-1 max-w-[14rem] text-sm text-ink-muted">
              {hasReference && pitchTol != null
                ? "Notas cantadas dentro da tolerância da referência."
                : "Trechos em que a voz foi detectada com confiança."}
            </p>
          </div>
        </div>

        <div className="min-w-0 rounded-xl bg-ink/[0.03] p-4 ring-1 ring-inset ring-ink/5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="hud-label">Contorno melódico</p>
            <p className="text-data text-xs text-ink-faint">
              {range.min_hz != null && range.max_hz != null ? `${range.min_hz}–${range.max_hz} Hz` : "—"}
            </p>
          </div>
          {contour.length > 1 ? (
            <Sparkline
              values={contour}
              height={64}
              className="mt-3 h-16"
              label="Contorno de altura da voz ao longo da gravação"
            />
          ) : (
            <p className="mt-4 text-sm text-ink-muted">Material insuficiente para o contorno.</p>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Stat
          label="Nota central (mediana)"
          value={range.median_hz != null ? Math.round(range.median_hz) : "—"}
          unit={range.median_hz != null ? "Hz" : undefined}
          hint={stats.predominant_note_name ? `Nota predominante ${stats.predominant_note_name}` : undefined}
        />
        <Stat
          label="Extensão observada"
          value={range.span_semitones != null ? range.span_semitones : "—"}
          unit={range.span_semitones != null ? "st" : undefined}
          hint="Semitons entre a nota mais grave e a mais aguda"
        />
        <Stat
          label="Estabilidade"
          value={stats.stable_region_variation_cents_median != null ? stats.stable_region_variation_cents_median : "—"}
          unit={stats.stable_region_variation_cents_median != null ? "cents" : undefined}
          hint="Variação mediana nas notas sustentadas (menor = mais estável)"
        />
        {hasReference ? (
          <Stat
            label="Desvio médio"
            value={meanCents != null ? Math.round(meanCents) : "—"}
            unit={meanCents != null ? "cents" : undefined}
            tone={meanCents != null && meanCents > 50 ? "flare" : "default"}
            hint="Distância média até a nota da referência"
          />
        ) : (
          <Stat label="Ocorrências" value={events} tone={events > 0 ? "flare" : "accent"} hint="Trechos com evidência técnica" />
        )}
        {hasReference && rhythmTol != null ? (
          <Stat label="Ritmo na tolerância" value={rhythmTol} unit="%" hint="Ataques no tempo da referência" />
        ) : null}
        {hasReference && report.detected_transposition != null ? (
          <Stat
            label="Transposição"
            value={`${report.detected_transposition > 0 ? "+" : ""}${report.detected_transposition}`}
            unit="st"
          />
        ) : null}
      </dl>
      {stats.vibrato_note ? <p className="mt-3 text-xs text-ink-muted">Vibrato: {stats.vibrato_note}</p> : null}
    </Panel>
  );
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
