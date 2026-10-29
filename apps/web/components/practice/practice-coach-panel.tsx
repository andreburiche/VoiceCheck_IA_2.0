"use client";

import Link from "next/link";
import { GraduationCap, History, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import type { PitchFeedbackEvent, PracticePitchAnalysis } from "@/lib/practice-pitch-analysis";
import { formatClock } from "@/lib/stem-theme";
import { cn } from "@/lib/utils";

type SessionRow = {
  id: string;
  profile: string;
  duration_sec: number;
  created_at?: string;
};

type PracticeCoachPanelProps = {
  projectId: string;
  tab: "feedback" | "historico";
  onTabChange: (t: "feedback" | "historico") => void;
  sessions: SessionRow[];
  analysis?: PracticePitchAnalysis | null;
  onSeek?: (sec: number) => void;
  className?: string;
};

/**
 * Professor Vocal — feedback a partir de eventos estruturados (Fase 3+).
 */
export function PracticeCoachPanel({
  projectId,
  tab,
  onTabChange,
  sessions,
  analysis,
  onSeek,
  className,
}: PracticeCoachPanelProps) {
  const events = analysis
    ? [...analysis.pitchEvents, ...analysis.rhythmEvents].sort((a, b) => a.songSec - b.songSec)
    : [];
  const exercises = analysis ? exercisesFromAnalysis(analysis) : [];

  return (
    <aside
      className={cn(
        "flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-line/70 bg-glass shadow-panel",
        className,
      )}
      aria-label="Professor vocal IA"
    >
      <div
        className="flex gap-1 border-b border-line/60 p-1.5"
        role="tablist"
        aria-label="Painel do coach"
      >
        <TabBtn active={tab === "feedback"} onClick={() => onTabChange("feedback")} icon={Sparkles}>
          Feedback da IA
        </TabBtn>
        <TabBtn active={tab === "historico"} onClick={() => onTabChange("historico")} icon={History}>
          Histórico
        </TabBtn>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "feedback" ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/5 px-3 py-3">
              <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-ink">Professor vocal</p>
                <p className="text-xs leading-relaxed text-ink-muted">
                  {analysis
                    ? `Comparado com ${analysis.refSource === "lab_notes" ? "a partitura do Laboratório vocal" : "a voz original separada"}. Os textos vêm só das medições do seu ensaio.`
                    : "Analise um ensaio na aba Afinação para ver os desvios com o momento exato de cada um."}
                </p>
              </div>
            </div>

            {!analysis ? (
              <>
                <EmptyBlock
                  title="Erros identificados"
                  hint="Rode “Analisar ensaio” com um take sincronizado."
                />
                <EmptyBlock
                  title="Pontos positivos"
                  hint="Aparecem quando houver trechos cantados dentro da tolerância."
                />
                <EmptyBlock
                  title="Exercícios sugeridos"
                  hint="Derivados das categorias dos eventos detectados."
                />
              </>
            ) : (
              <>
                <section className="space-y-2">
                  <p className="text-xs font-medium text-ink-faint">
                    Ocorrências
                  </p>
                  {events.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line px-3 py-4 text-xs text-ink-muted">
                      Nenhum desvio persistente acima do limiar de confiança. Isso não é nota de
                      “qualidade vocal” — só ausência de eventos mensurados.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {events.slice(0, 12).map((ev) => (
                        <EventCard key={ev.id} ev={ev} onSeek={onSeek} />
                      ))}
                    </ul>
                  )}
                </section>

                <section className="space-y-2">
                  <p className="text-xs font-medium text-ink-faint">
                    Pontos positivos (medidos)
                  </p>
                  {analysis.inTolerancePct != null && analysis.inTolerancePct >= 60 ? (
                    <p className="rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-ink-muted">
                      {analysis.inTolerancePct}% dos frames vozeados ficaram dentro de ±
                      {analysis.toleranceCents}¢ ({analysis.voicedFrames} frames).
                    </p>
                  ) : (
                    <p className="text-xs text-ink-faint">
                      Sem destaque positivo ainda — aumente frames dentro da tolerância ou ajuste ±¢.
                    </p>
                  )}
                </section>

                <section className="space-y-2">
                  <p className="text-xs font-medium text-ink-faint">
                    Exercícios sugeridos
                  </p>
                  {exercises.length === 0 ? (
                    <p className="text-xs text-ink-faint">Nenhuma categoria de desvio para treinar.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {exercises.map((ex) => (
                        <li
                          key={ex}
                          className="rounded-lg border border-line/70 px-3 py-2 text-xs text-ink-muted"
                        >
                          {ex}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            <p className="text-xs leading-relaxed text-ink-faint">
              Partitura / solfejo:{" "}
              <Link href={`/projects/${projectId}/vocal-lab`} className="text-accent hover:underline">
                Laboratório de Vozes
              </Link>
              . Não diagnosticamos tensão laríngea nem patologia por áudio.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-ink-muted">
              Sessões registradas (duração e perfil). Comparação de tentativas entra na Fase 6.
            </p>
            {sessions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-sm text-ink-faint">
                Nenhuma sessão ainda — use “Salvar sessão” após treinar.
              </p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line/70 text-sm">
                {sessions.slice(0, 12).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <span className="capitalize text-ink">{s.profile}</span>
                    <span className="font-mono text-xs text-ink-faint">{s.duration_sec}s</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function EventCard({
  ev,
  onSeek,
}: {
  ev: PitchFeedbackEvent;
  onSeek?: (sec: number) => void;
}) {
  return (
    <li
      className={cn(
        "rounded-xl border px-3 py-2",
        ev.type === "pitch" ? "border-signal-err/30 bg-signal-err/5" : "border-signal-warn/30 bg-signal-warn/5",
      )}
    >
      <button
        type="button"
        className="font-mono text-xs text-accent hover:underline"
        onClick={() => onSeek?.(Math.max(0, ev.songSec - 0.15))}
      >
        {formatClock(ev.songSec)} · {ev.kind} · {ev.measured}
      </button>
      <p className="mt-1 text-xs leading-snug text-ink-muted">{ev.explanation}</p>
    </li>
  );
}

function exercisesFromAnalysis(a: PracticePitchAnalysis): string[] {
  const out: string[] = [];
  const hasPitch = a.pitchEvents.length > 0;
  const hasRhythm = a.rhythmEvents.length > 0;
  if (hasPitch) {
    out.push("Afinação: ouça a referência, depois sustente a nota alvo em volume confortável.");
    out.push("Afinação: repita o trecho em velocidade 75% com loop A–B.");
  }
  if (hasRhythm) {
    out.push("Ritmo: conte 4 tempos de preparação com metrônomo antes da entrada.");
    out.push("Ritmo: isole só a entrada (loop curto) e marque o ataque com a mão.");
  }
  if (hasPitch && a.inTolerancePct != null && a.inTolerancePct < 50) {
    out.push("Estabilidade: sustente 3–4 s em uma nota confortável, sem forçar o volume.");
  }
  return out.slice(0, 4);
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Sparkles;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition",
        active ? "bg-accent/15 text-accent" : "text-ink-muted hover:text-ink",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </button>
  );
}

function EmptyBlock({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line/80 px-3 py-3">
      <p className="text-xs font-medium text-ink-faint">{title}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}
