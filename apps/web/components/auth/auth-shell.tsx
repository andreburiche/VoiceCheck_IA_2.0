import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SeletorTema } from "@/components/layout/seletor-tema";
import { BrandLogo } from "@/components/brand/brand-logo";

/**
 * Layout de autenticação na linha da página inicial: à esquerda (desktop) a marca, um título
 * curto e o produto de verdade (painel que mede uma voz, ou os passos do cadastro); à direita
 * o formulário. Sem foto de fundo nem degradê — a grade de medição é o único fundo.
 */
export function AuthShell({
  title,
  highlight,
  text,
  aside,
  back = { href: "/", label: "Voltar ao site", short: "Início" },
  children,
}: {
  /** Único link de "voltar" da tela: site (login/cadastro) ou login (recuperação de senha). */
  back?: { href: string; label: string; short: string };
  title: string;
  /** Trecho final do título destacado em turquesa (ex.: "medida."). */
  highlight?: string;
  text: string;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside
        className="relative isolate hidden flex-col justify-between gap-10 overflow-hidden border-r border-line/70 bg-canvas-raised px-12 py-10 lg:sticky lg:top-0 lg:flex lg:h-screen xl:px-16"
        aria-label="Sobre o VoiceCheck IA"
      >
        <div className="hud-grid absolute inset-x-0 top-0 -z-10 h-[32rem]" aria-hidden />

        <BrandLogo href="/" variant="light" size="lg" layout="horizontal" />

        <div className="motion-safe:animate-fade-up">
          <p className="max-w-lg text-balance font-display text-4xl font-bold leading-[1.04] tracking-[-0.035em] text-ink xl:text-[3.25rem]">
            {title}
            {highlight ? <span className="text-accent"> {highlight}</span> : null}
          </p>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink/90">{text}</p>
          <div className="mt-10 max-w-[560px]">{aside}</div>
        </div>

        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-muted">
          <li>Gravações não vão para serviços externos de IA</li>
          <li>Dados do paciente conforme a LGPD</li>
        </ul>
      </aside>

      <main className="relative isolate flex min-h-screen flex-col px-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col">
          <header className="flex min-h-[46px] items-center justify-between gap-4 pt-6 sm:pt-8 lg:min-h-[54px] lg:box-content lg:pt-10">
            <div className="lg:hidden">
              <BrandLogo href="/" variant="light" size="md" layout="horizontal" />
            </div>
            <SeletorTema className="ml-auto" />
            <Link
              href={back.href}
              className="group -mr-2 inline-flex h-9 toque:h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink-muted transition-colors duration-ui hover:bg-canvas-overlay/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowLeft
                className="h-4 w-4 transition-transform duration-ui group-hover:-translate-x-0.5 motion-reduce:transition-none"
                aria-hidden
              />
              <span className="sm:hidden">{back.short}</span>
              <span className="hidden sm:inline">{back.label}</span>
            </Link>
          </header>

          <div className="flex flex-1 flex-col justify-center py-8 motion-safe:animate-fade-up sm:py-10">
            {/* No celular, o título do lado esquerdo vira uma linha acima do formulário */}
            <p className="mb-6 text-balance font-display text-2xl font-bold leading-tight tracking-[-0.03em] text-ink lg:hidden" aria-hidden>
              {title}
              {highlight ? <span className="text-accent"> {highlight}</span> : null}
            </p>
            <div className="rounded-3xl border border-line/80 bg-canvas-raised p-6 shadow-[0_24px_60px_-30px_rgb(var(--c-sombra)/calc(0.6*var(--k-sombra)))] sm:p-8">
              {children}
            </div>
          </div>

          <footer className="pb-6 text-center text-xs text-ink-faint sm:pb-8 lg:text-left">
            © {new Date().getFullYear()} VoiceCheck IA
          </footer>
        </div>
      </main>
    </div>
  );
}
