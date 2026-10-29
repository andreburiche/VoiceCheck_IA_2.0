import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { studioMedia } from "@/lib/media";

/**
 * Layout de autenticação: à esquerda (desktop) foto cinematográfica + o produto
 * de verdade (um fragmento de interface); à direita o formulário em vidro.
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
  /** Trecho final do título destacado em turquesa (ex.: "por nota."). */
  highlight?: string;
  text: string;
  aside: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate grid min-h-screen bg-canvas lg:grid-cols-2">
      <aside
        className="relative isolate hidden flex-col justify-between gap-10 overflow-hidden px-12 py-10 lg:sticky lg:top-0 lg:flex lg:h-screen xl:px-14"
        aria-label="Sobre o VoiceCheck IA"
      >
        <div className="absolute inset-0 -z-20" aria-hidden>
          <Image
            src={studioMedia.heroBooth.src}
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover opacity-35"
          />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-canvas/95 via-canvas/80 to-canvas/60" aria-hidden />

        <div className="flex items-center gap-4">
          <BrandLogo href="/" variant="light" size="lg" layout="horizontal" />
        </div>
        <div>
          <p className="max-w-md text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink xl:text-5xl">
            {title}
            {highlight ? <span className="text-accent"> {highlight}</span> : null}
          </p>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-ink/90">{text}</p>
          <div className="mt-10 max-w-[520px]">{aside}</div>
        </div>
        <p className="text-xs text-ink-muted">Suas gravações não são enviadas a serviços externos de IA.</p>
      </aside>

      <main className="relative isolate flex min-h-screen flex-col px-5 sm:px-8 lg:px-12">

        {/* Uma coluna só (cabeçalho, cartão e rodapé) — tudo alinhado à mesma borda do formulário */}
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
          {/* Mesma altura/linha do logo da coluna da esquerda (py-10 + logo lg) */}
          <header className="flex min-h-[46px] items-center justify-between gap-4 pt-6 sm:pt-8 lg:min-h-[54px] lg:box-content lg:pt-10">
            <div className="lg:hidden">
              <BrandLogo href="/" variant="light" size="md" layout="horizontal" />
            </div>
            <Link
              href={back.href}
              className="group -mx-2 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-ink-muted transition-colors duration-ui hover:bg-canvas-overlay/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ArrowLeft
                className="h-4 w-4 transition-transform duration-ui group-hover:-translate-x-0.5 motion-reduce:transition-none"
                aria-hidden
              />
              <span className="sm:hidden">{back.short}</span>
              <span className="hidden sm:inline">{back.label}</span>
            </Link>
          </header>

          <div className="flex flex-1 flex-col justify-center py-8 sm:py-10">
            <div className="panel-glass rounded-3xl p-6 sm:p-8">{children}</div>
          </div>

          <footer className="pb-6 text-center text-xs text-ink-faint sm:pb-8 lg:text-left">
            © {new Date().getFullYear()} VoiceCheck IA
          </footer>
        </div>
      </main>
    </div>
  );
}
