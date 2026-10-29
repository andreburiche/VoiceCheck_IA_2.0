import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="px-5 py-24 sm:px-8 lg:py-32">
      <div className="panel-glass relative mx-auto max-w-content overflow-hidden rounded-3xl px-6 py-14 sm:px-12 lg:py-20">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-accent/15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col items-start gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2
              id="cta-title"
              className="text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl lg:text-6xl"
            >
              Comece pela próxima música
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/90">
              Crie a conta, envie a faixa que você está ensaiando e veja a primeira análise em poucos
              minutos.
            </p>
          </div>
          <Link
            href="/register"
            className={buttonVariants({
              size: "lg",
              className: "shrink-0 rounded-full px-8 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.8)]",
            })}
          >
            Criar conta grátis
          </Link>
        </div>
      </div>
    </section>
  );
}
