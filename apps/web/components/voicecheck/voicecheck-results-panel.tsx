"use client";

import Link from "next/link";

import type { ReactNode } from "react";

import { VoiceCheckMyReports } from "@/components/voicecheck/voicecheck-my-reports";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";
import type {
  VoiceCheckEvent,
  VoiceCheckF0Report,
  VoiceCheckPositive,
  VoiceCheckRecommendation,
} from "@/lib/voicecheck-f0-analysis";

type Props = {
  report: VoiceCheckF0Report | null;
  onPlayEvent: (start: number, end: number) => void;
  studentName?: string | null;
  teacherName?: string | null;
  assetName?: string | null;
  projectId?: string | null;
};

export function VoiceCheckResultsPanel({
  report,
  onPlayEvent,
  studentName,
  teacherName,
  assetName,
  projectId,
}: Props) {
  if (!report) {
    return (
      <p className="text-sm text-ink-muted">Analise a voz para ver os resultados aqui.</p>
    );
  }

  const events = report.events ?? [];
  const positives = report.positive_findings ?? [];
  const recs = report.recommendations ?? [];
  const engine = report.processing_engine ?? report.algorithm;

  return (
    <div className="space-y-5">
      <p className="text-sm">
        <Link href="/ajuda#resultados" className="text-accent hover:underline">
          O que significa cada número?
        </Link>
      </p>

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-ink/10 text-sm sm:grid-cols-3">
        <Stat
          label="Nota central (mediana)"
          value={
            report.observed_range.median_hz != null
              ? `${report.observed_range.median_hz} Hz`
              : "—"
          }
        />
        <Stat label="Áudio com voz aproveitado" value={`${report.statistics.valid_frame_percent}%`} />
        <Stat label="Ocorrências" value={String(events.length)} alert={events.length > 0} />
      </dl>

      {report.comparison && !report.no_reference ? (
        <Section title="Comparação com referência">
          <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-ink/10 text-sm sm:grid-cols-3">
            <Stat
              label="Afinação na tolerância"
              value={
                report.comparison.pitch?.within_tolerance_percent != null
                  ? `${report.comparison.pitch.within_tolerance_percent}%`
                  : "—"
              }
            />
            <Stat
              label="Ritmo na tolerância"
              value={
                report.comparison.rhythm?.within_tolerance_percent != null
                  ? `${report.comparison.rhythm.within_tolerance_percent}%`
                  : "—"
              }
            />
            <Stat
              label="Transposição"
              value={
                report.detected_transposition != null && report.detected_transposition !== 0
                  ? `${report.detected_transposition > 0 ? "+" : ""}${report.detected_transposition} st`
                  : "0 st"
              }
            />
          </dl>
        </Section>
      ) : null}

      {events.length > 0 ? (
        <Section title="Linha do tempo">
          <EventTimeline events={events} duration={report.duration_seconds} onPlay={onPlayEvent} />
        </Section>
      ) : null}

      <Section title="Ocorrências">
        {events.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nenhuma ocorrência com evidência suficiente. Isso é esperado em trechos estáveis —
            não inventamos eventos.
          </p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {events.map((ev) => (
              <EventCard key={ev.id} event={ev} onPlay={onPlayEvent} />
            ))}
          </ul>
        )}
      </Section>

      {(report.melodic_consistency_events?.length ?? 0) > 0 ||
      report.melodic_consistency ? (
        <Section title="Coerência melódica (experimental)">
          <p className="mb-2 text-xs text-ink-faint">
            {(report.melodic_consistency?.disclaimer as string | undefined) ||
              "Diferenças entre frases semelhantes são pontos de revisão — não erros automáticos."}
          </p>
          {(report.melodic_consistency_events?.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-muted">
              {String(report.melodic_consistency?.status ?? "sem pares semelhantes")}
              {typeof report.melodic_consistency?.similar_phrase_pairs === "number"
                ? ` · ${report.melodic_consistency.similar_phrase_pairs} pares`
                : ""}
            </p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {report.melodic_consistency_events!.map((ev) => (
                <EventCard key={ev.id} event={ev} onPlay={onPlayEvent} />
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      <Section title="Pontos positivos">
        {positives.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nenhum ponto positivo calibrado nesta gravação (ou material insuficiente).
          </p>
        ) : (
          <ul className="space-y-2">
            {positives.map((p) => (
              <PositiveCard key={p.id} item={p} onPlay={onPlayEvent} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Plano de melhoria">
        {recs.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Sem recomendações — não há eventos com orientação associada.
          </p>
        ) : (
          <ul className="space-y-2">
            {recs.map((r) => (
              <RecCard key={r.key} item={r} onPlay={onPlayEvent} />
            ))}
          </ul>
        )}
      </Section>

      {report.warnings?.length ? (
        <ul className="space-y-1 text-xs text-ink-faint">
          {report.warnings.map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      ) : null}
      <VoiceCheckMyReports
        report={report}
        projectId={projectId}
        studentName={studentName}
        teacherName={teacherName}
        assetName={assetName}
      />



      <details className="rounded-xl border border-line/70 px-4 py-3 text-sm">
        <summary className="cursor-pointer text-ink-muted hover:text-ink">Detalhes técnicos da análise</summary>
        <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-data rounded-md bg-ink/5 px-2 py-1 text-xs text-ink-muted">
          {report.analysis_version}
        </span>
        <span className="text-data rounded-md bg-ink/5 px-2 py-1 text-xs text-ink-muted">
          {engine}
        </span>
        {report.client_fallback ? (
          <span className="rounded-md bg-flare/10 px-2 py-1 text-xs text-flare-soft">
            análise simplificada — sem ocorrências técnicas
          </span>
        ) : null}
      </div>

      {report.reference_mode ? (
        <p className="text-xs text-ink-muted">
          Modo: <span className="text-data text-ink">{report.reference_mode}</span>
          {report.reference_quality ? (
            <>
              {" "}
              · qualidade{" "}
              <span className="text-data text-ink">{report.reference_quality}</span>
            </>
          ) : null}
          {report.alignment_status ? (
            <>
              {" "}
              · alinhamento{" "}
              <span className="text-data text-ink">{report.alignment_status}</span>
            </>
          ) : null}
        </p>
      ) : null}

        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="bg-canvas-raised/90 px-4 py-3">
      <dt className="hud-label">{label}</dt>
      <dd className={cn("text-data mt-1 text-xl font-semibold", alert ? "text-flare-soft" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}

function EventTimeline({
  events,
  duration,
  onPlay,
}: {
  events: VoiceCheckEvent[];
  duration: number;
  onPlay: (s: number, e: number) => void;
}) {
  const dur = Math.max(duration || 1, 0.1);
  const sorted = [...events].sort((a, b) => a.start_seconds - b.start_seconds).slice(0, 40);
  return (
    <div className="space-y-2">
      <div className="relative h-12 overflow-hidden rounded-xl bg-canvas/60 ring-1 ring-inset ring-ink/10">
        <div className="hud-grid pointer-events-none absolute inset-0" aria-hidden />
        {sorted.map((ev) => {
          const left = Math.min(98, Math.max(0, (ev.start_seconds / dur) * 100));
          const width = Math.min(
            100 - left,
            Math.max(0.8, ((ev.end_seconds - ev.start_seconds) / dur) * 100),
          );
          return (
            <button
              key={ev.id}
              type="button"
              title={`${formatClock(ev.start_seconds)} · ${ev.title || ev.category}`}
              aria-label={`Ouvir ${ev.title || ev.category} em ${formatClock(ev.start_seconds)}`}
              className="absolute top-2.5 h-7 rounded-md bg-flare/60 transition-colors hover:bg-flare focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flare"
              style={{ left: `${left}%`, width: `${width}%` }}
              onClick={() =>
                onPlay(Math.max(0, ev.start_seconds - 0.1), ev.end_seconds + 0.1)
              }
            />
          );
        })}
      </div>
      <p className="text-data text-xs text-ink-faint">
        0:00 — {formatClock(dur)} · clique num marcador para ouvir
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function EventCard({
  event,
  onPlay,
}: {
  event: VoiceCheckEvent;
  onPlay: (s: number, e: number) => void;
}) {
  const start = event.playback?.start_seconds ?? Math.max(0, event.start_seconds - 0.15);
  const end = event.playback?.end_seconds ?? event.end_seconds + 0.15;
  return (
    <li className="relative overflow-hidden rounded-xl bg-ink/[0.03] py-3 pl-4 pr-3 text-sm ring-1 ring-inset ring-ink/10">
      <span className="absolute inset-y-0 left-0 w-0.5 bg-flare" aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink">{event.title || event.category}</p>
          <p className="text-data mt-0.5 text-xs text-flare-soft">
            {formatClock(event.start_seconds)} – {formatClock(event.end_seconds)}
            {event.confidence != null ? ` · confiança ${Math.round(event.confidence * 100)}%` : ""}
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => onPlay(start, end)}>
          Ouvir
        </Button>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{event.description}</p>
      {event.guidance ? <p className="mt-1 text-xs text-ink">{event.guidance}</p> : null}
      {event.exercise ? (
        <p className="text-data mt-1 text-xs text-accent">Exercício: {event.exercise}</p>
      ) : null}
      {event.evidence ? (
        <p className="text-data mt-1 text-xs text-ink-faint">
          {Object.entries(event.evidence)
            .slice(0, 4)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(" · ")}
        </p>
      ) : null}
    </li>
  );
}

function PositiveCard({
  item,
  onPlay,
}: {
  item: VoiceCheckPositive;
  onPlay: (s: number, e: number) => void;
}) {
  return (
    <li className="relative overflow-hidden rounded-xl bg-accent/[0.05] py-3 pl-4 pr-3 text-sm ring-1 ring-inset ring-accent/20">
      <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-ink">{item.title}</p>
        {item.start_seconds != null && item.end_seconds != null ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onPlay(Math.max(0, item.start_seconds! - 0.1), item.end_seconds! + 0.1)
            }
          >
            Ouvir
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-ink-muted">{item.description}</p>
    </li>
  );
}

function RecCard({
  item,
  onPlay,
}: {
  item: VoiceCheckRecommendation;
  onPlay: (s: number, e: number) => void;
}) {
  return (
    <li className="rounded-xl bg-ink/[0.03] px-4 py-3 text-sm ring-1 ring-inset ring-ink/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-ink">{item.title}</p>
        {item.start_seconds != null && item.end_seconds != null ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              onPlay(Math.max(0, item.start_seconds! - 0.1), item.end_seconds! + 0.1)
            }
          >
            Ouvir
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-ink-muted">{item.text}</p>
      {item.exercise ? (
        <p className="text-data mt-1 text-xs text-accent">Exercício: {item.exercise}</p>
      ) : null}
      {item.disclaimer ? (
        <p className="mt-1 text-xs text-ink-faint">{item.disclaimer}</p>
      ) : null}
    </li>
  );
}
