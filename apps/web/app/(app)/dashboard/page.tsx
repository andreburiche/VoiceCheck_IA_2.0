"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AudioLines,
  CalendarClock,
  CalendarDays,
  Clock3,
  FolderKanban,
  Layers,
  Mic2,
  Music2,
  Stethoscope,
  TextCursorInput,
  Upload,
  Users,
  Waves,
} from "lucide-react";

import { AgendaHoje } from "@/components/dashboard/agenda-hoje";
import { KpisTopo, type Kpi } from "@/components/dashboard/kpis-topo";
import { LastDiagnosisCard } from "@/components/dashboard/last-diagnosis-card";
import { PacientesRecentes } from "@/components/dashboard/pacientes-recentes";
import { Reavaliacao } from "@/components/dashboard/reavaliacao";
import { StatusConsole } from "@/components/dashboard/status-console";
import { Panel, Stat, TrendChart } from "@/components/hud";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectCard } from "@/components/ui/project-card";
import { QuickActionCard } from "@/components/ui/quick-action-card";
import {
  assetsApi,
  authApi,
  practiceApi,
  projectsApi,
  usageApi,
  type AudioAsset,
  type Project,
} from "@/lib/api";
import { formatHours } from "@/lib/format";
import { consultasDeHoje, faixasReavaliacao, proximaConsulta } from "@/lib/painel";
import { horaBR, somarDias } from "@/lib/voz-clinica-agenda";
import { listarAgenda, listarPacientes } from "@/lib/voz-clinica-api";
import { CardGridSkeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/errors";

type ProjectSnapshot = {
  project: Project;
  originals: AudioAsset[];
  stems: AudioAsset[];
};

const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function DashboardPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => authApi.me() });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => projectsApi.list() });
  const originals = useQuery({
    queryKey: ["assets", "original"],
    queryFn: () => assetsApi.list({ kind: "original" }),
  });
  const stems = useQuery({
    queryKey: ["assets", "stem"],
    queryFn: () => assetsApi.list({ kind: "stem" }),
  });
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => usageApi.me() });

  const recentProjects = useMemo(() => (projects.data?.items ?? []).slice(0, 6), [projects.data?.items]);

  const snapshots = useQuery({
    queryKey: ["dashboard-project-snapshots", recentProjects.map((p) => p.id)],
    enabled: recentProjects.length > 0,
    queryFn: async (): Promise<ProjectSnapshot[]> => {
      const allStems = stems.data?.items ?? (await assetsApi.list({ kind: "stem" })).items;
      const allOriginals = originals.data?.items ?? (await assetsApi.list({ kind: "original" })).items;
      return recentProjects.map((project) => ({
        project,
        originals: allOriginals.filter((a) => a.project_id === project.id),
        stems: allStems.filter((a) => a.project_id === project.id),
      }));
    },
  });

  /** Sessões de treino: total e minutos por dia nos últimos 7 dias (dados reais). */
  const practice = useQuery({
    queryKey: ["dashboard-practice", recentProjects.map((p) => p.id)],
    enabled: (projects.data?.items.length ?? 0) > 0,
    queryFn: async () => {
      const list = projects.data?.items ?? [];
      // Limita a 12 projetos para manter o painel leve
      const sample = list.slice(0, 12);
      const sessions = (await Promise.all(sample.map((p) => practiceApi.list(p.id)))).flatMap((s) => s.items);
      const total = sessions.reduce((sum, item) => sum + (item.duration_sec || 0), 0);
      const today = new Date();
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        return d;
      });
      const byDay = new Map(days.map((d) => [dayKey(d), 0]));
      for (const s of sessions) {
        const k = dayKey(new Date(s.created_at));
        if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + (s.duration_sec || 0));
      }
      const week = days.map((d) => ({
        label: WEEKDAY[d.getDay()],
        value: Math.round((byDay.get(dayKey(d)) ?? 0) / 60),
      }));
      return { total, week, count: sessions.length };
    },
  });

  const first = recentProjects[0];
  const clinico = !!me.data?.acesso_clinico;

  // Área clínica: agenda de hoje + próximos 14 dias (para "próxima consulta") e pacientes
  const inicioHoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const agenda = useQuery({
    queryKey: ["painel-agenda", inicioHoje.toISOString()],
    queryFn: () => listarAgenda(inicioHoje, somarDias(inicioHoje, 14)),
    enabled: clinico,
    retry: false,
  });
  const pacientes = useQuery({ queryKey: ["voz-pacientes"], queryFn: () => listarPacientes(), enabled: clinico, retry: false });
  const importHref = "/projects?new=1";
  const studioHref = first != null ? `/projects/${first.id}/studio` : "/projects";
  const practiceHref = first != null ? `/projects/${first.id}/practice` : "/projects";
  const vocalLabHref = first != null ? `/projects/${first.id}/vocal-lab` : "/projects";
  const lyricsHref = first != null ? `/projects/${first.id}/practice#letras` : "/projects";

  const loadingMetrics = projects.isLoading || originals.isLoading || stems.isLoading || usage.isLoading;
  const week = practice.data?.week ?? [];
  const weekMax = Math.max(30, ...week.map((w) => w.value));
  const weekTotal = week.reduce((s, w) => s + w.value, 0);
  const nome = (me.data?.name ?? "").split(" ")[0] || "você";

  const hoje = consultasDeHoje(agenda.data?.items ?? []);
  const proxima = proximaConsulta(agenda.data?.items ?? []);
  const atrasados = faixasReavaliacao(pacientes.data?.items ?? []).find((f) => f.alerta)?.pacientes ?? 0;
  const confirmadasHoje = hoje.filter((c) => c.situacao === "confirmada").length;
  const proximaRotulo = proxima
    ? new Date(proxima.inicio).toDateString() === new Date().toDateString()
      ? `hoje, ${horaBR(proxima.inicio)}`
      : new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit" }).format(new Date(proxima.inicio)) + `, ${horaBR(proxima.inicio)}`
    : "—";

  const kpis: Kpi[] = clinico
    ? [
        { icone: CalendarDays, valor: String(hoje.length), rotulo: "Consultas hoje", etiqueta: confirmadasHoje ? `${confirmadasHoje} confirmada${confirmadasHoje > 1 ? "s" : ""}` : undefined },
        { icone: Clock3, valor: proximaRotulo, rotulo: "Próxima consulta" },
        { icone: Users, valor: String(pacientes.data?.items.length ?? 0), rotulo: "Pacientes", etiqueta: atrasados ? `${atrasados} há +90 dias` : undefined, alerta: true },
      ]
    : [
        { icone: Music2, valor: String(projects.data?.total ?? 0), rotulo: "Músicas" },
        { icone: Layers, valor: String(stems.data?.total ?? 0), rotulo: "Faixas separadas" },
        { icone: CalendarClock, valor: formatHours(practice.data?.total ?? 0), rotulo: "Treino total", etiqueta: weekTotal ? `${weekTotal} min na semana` : undefined },
      ];
  const carregandoKpis = clinico ? agenda.isLoading || pacientes.isLoading : loadingMetrics;

  return (
    <div className="page-shell space-y-6">
      {/* Topo: saudação, ações e os números principais lado a lado */}
      <header className="flex flex-col gap-6 motion-safe:animate-fade-up xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-balance font-display text-3xl font-bold tracking-[-0.03em] text-ink md:text-4xl">Olá, {nome}</h1>
          <p className="mt-1.5 max-w-lg text-base text-ink-muted">
            {clinico ? "Sua agenda, seus pacientes e o que pede atenção hoje." : "Suas músicas, faixas e treino num lugar só."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {clinico ? (
              <Link href="/voz-clinica" className={buttonVariants({ className: "rounded-full" })}>
                <Stethoscope className="h-4 w-4" aria-hidden />
                Nova avaliação
              </Link>
            ) : null}
            <Link href={importHref} className={buttonVariants({ variant: clinico ? "secondary" : "default", className: "rounded-full" })}>
              <Upload className="h-4 w-4" aria-hidden />
              Importar música
            </Link>
          </div>
        </div>
        <KpisTopo itens={kpis} carregando={carregandoKpis} />
      </header>

      {clinico ? (
        <div className="grid grid-cols-1 gap-4 motion-safe:animate-fade-up-delay lg:grid-cols-3">
          <AgendaHoje className="lg:col-span-2" consultas={agenda.data?.items} carregando={agenda.isLoading} erro={agenda.isError} />
          <Reavaliacao pacientes={pacientes.data?.items} carregando={pacientes.isLoading} erro={pacientes.isError} />
          <PacientesRecentes className="lg:col-span-2" />
          <StatusConsole />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 motion-safe:animate-fade-up-delay lg:grid-cols-3">
          <LastDiagnosisCard className="lg:col-span-2" />
          <StatusConsole />
        </div>
      )}

      {clinico ? <LastDiagnosisCard /> : null}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Panel
          id="treino-semana"
          title="Treino nos últimos 7 dias"
          subtitle={
            practice.data
              ? weekTotal > 0
                ? `${weekTotal} min no total`
                : "Nenhuma sessão nesta semana"
              : "Minutos por dia"
          }
        >
          {week.length > 0 && weekTotal > 0 ? (
            <TrendChart
              points={week}
              min={0}
              max={weekMax}
              unit=" min"
              height={190}
              title={`Minutos de treino por dia: ${week.map((w) => `${w.label} ${w.value}`).join(", ")}`}
            />
          ) : (
            <div className="flex min-h-[190px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 text-center">
              <p className="max-w-sm text-sm text-ink-muted">
                {projects.isLoading || practice.isLoading
                  ? "Carregando sessões…"
                  : "Seus minutos de treino aparecem aqui. Abra uma música no Treino e pratique um trecho para começar."}
              </p>
              {!(projects.isLoading || practice.isLoading) && practiceHref !== "/projects" ? (
                <Link href={practiceHref} className={buttonVariants({ size: "sm", variant: "secondary" })}>
                  Começar um treino
                </Link>
              ) : null}
            </div>
          )}
        </Panel>

        <Panel
          id="acoes"
          title={first ? "Continuar de onde parou" : "Comece por aqui"}
          subtitle={first ? first.name : undefined}
          bodyClassName="grid gap-2.5"
        >
          {first ? (
            <>
              <QuickActionCard href={studioHref} title="Estúdio" description="Mixer, tom, efeitos e comparação A/B" icon={Waves} />
              <QuickActionCard href={practiceHref} title="Treino" description="Loop por trechos, metrônomo e gravação" icon={Mic2} />
              <QuickActionCard href={lyricsHref} title="Letras sincronizadas" description="Letra linha a linha no tempo da música" icon={TextCursorInput} />
              <QuickActionCard href={vocalLabHref} title="Laboratório vocal" description="Melodia da voz em partitura e MIDI" icon={AudioLines} />
            </>
          ) : (
            <QuickActionCard href={importHref} title="Importar a primeira música" description="Música ou vídeo: MP3, WAV, FLAC, MP4…" icon={Upload} />
          )}
          {clinico ? <QuickActionCard href="/voz-clinica" title="Avaliação clínica" description="Paciente, medidas, protocolos e relatório" icon={Stethoscope} /> : null}
          <QuickActionCard href="/voicecheck" title="Diagnóstico vocal" description="Envie uma gravação e veja cada ocorrência" icon={Activity} />
        </Panel>
      </div>

      <section aria-labelledby="recent-projects-title" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 id="recent-projects-title" className="font-display text-lg font-semibold text-ink">
            Músicas recentes
          </h2>
        </div>

        {projects.isLoading ? <CardGridSkeleton count={2} label="Carregando músicas…" /> : null}

        {projects.isError ? (
          <p role="alert" className="text-sm text-signal-err">
            {friendlyError(projects.error)}
          </p>
        ) : null}

        {!projects.isLoading && (projects.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Nenhuma música ainda"
            description="Importe a primeira música para separar as faixas e começar a treinar."
            actionHref="/projects?new=1"
            actionLabel="Importar a primeira música"
          />
        ) : null}

        {(snapshots.data ?? []).length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {snapshots.data!.map(({ project, originals: orig, stems: stemList }) => {
              const main = orig[0];
              const busy = ["processing", "queued", "uploading"].includes(String(main?.status));
              const status =
                stemList.length > 0 ? "ready" : busy ? String(main?.status) : main?.status === "failed" ? "failed" : "none";
              return (
                <ProjectCard
                  key={project.id}
                  href={`/projects/${project.id}`}
                  title={project.name}
                  artist={project.description}
                  durationMs={main?.duration_ms}
                  stemCount={stemList.length}
                  status={status}
                />
              );
            })}
          </div>
        ) : null}

        {!projects.isLoading && (projects.data?.items.length ?? 0) > 0 && snapshots.isLoading ? (
          <p className="text-sm text-ink-muted">Carregando o status das músicas…</p>
        ) : null}
      </section>
    </div>
  );
}
