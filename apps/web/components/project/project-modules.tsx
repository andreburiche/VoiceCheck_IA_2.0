import Link from "next/link";
import { AudioLines, ChevronRight, Download, Mic2, Music2, Sparkles, TextCursorInput, Waves, type LucideIcon } from "lucide-react";


type ModuleTone = "accent" | "violet" | "dual";

type ProjectModule = {
  href: string;
  title: string;
  description: string;
  badge: string;
  icon: LucideIcon;
  tone: ModuleTone;
  featured?: boolean;
};

type ProjectModulesProps = {
  projectId: string;
};

export function ProjectModules({ projectId }: ProjectModulesProps) {
  const base = `/projects/${projectId}`;
  const modules: ProjectModule[] = [
    {
      href: `${base}/studio`,
      title: "Estúdio",
      description: "Mixer das faixas com equalizador, tom, efeitos e comparação A/B.",
      badge: "EQ · Pitch · FX · A/B",
      icon: Waves,
      tone: "dual",
      featured: true,
    },
    {
      href: `${base}/practice`,
      title: "Treino",
      description: "Loop por seções, metrônomo, gravação de takes e marcadores.",
      badge: "Seções · Takes · Loop",
      icon: Mic2,
      tone: "accent",
      featured: true,
    },
    {
      href: `${base}/practice#letras`,
      title: "Letras sincronizadas",
      description: "Letra linha a linha, sincronizada com a música.",
      badge: "Novo",
      icon: TextCursorInput,
      tone: "violet",
    },
    {
      href: `${base}/vocal-lab`,
      title: "Laboratório vocal",
      description: "Transcreve a melodia da voz em partitura, MIDI e MusicXML.",
      badge: "MIDI · MusicXML",
      icon: AudioLines,
      tone: "violet",
    },
    {
      href: `${base}#separacao`,
      title: "Separação de faixas",
      description: "Voz e instrumental, ou 4 faixas (voz, bateria, baixo e outros).",
      badge: "2 ou 4 faixas",
      icon: Sparkles,
      tone: "accent",
    },
    {
      href: `${base}/export`,
      title: "Exportar",
      description: "Faixas em WAV alinhadas, prontas para qualquer editor.",
      badge: "WAV · MP3",
      icon: Download,
      tone: "accent",
    },
  ];

  return (
    <section aria-labelledby="project-modules-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="project-modules-title" className="font-display text-lg font-semibold tracking-tight text-ink">
            Ferramentas
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Estúdio, treino, letras, laboratório vocal e exportação desta música.
          </p>
        </div>
        <Link
          href="/library"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-canvas-overlay hover:text-ink"
        >
          <Music2 className="h-3.5 w-3.5" aria-hidden />
          Setlists na Biblioteca
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {modules.map((m) => (
          <ModuleCard key={m.href + m.title} {...m} />
        ))}
      </div>
    </section>
  );
}

function ModuleCard({ href, title, description, icon: Icon }: ProjectModule) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-line/80 bg-canvas-raised/60 p-4 transition-colors duration-ui hover:border-line hover:bg-canvas-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-ink-muted">{description}</span>
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-ui group-hover:translate-x-0.5 group-hover:text-ink"
        aria-hidden
      />
    </Link>
  );
}
