"use client";

import Link from "next/link";
import { useRef } from "react";

import { PainelAoVivo } from "@/components/marketing/voz/painel-ao-vivo";
import { useProgressoRolagem } from "@/components/marketing/voz/use-progresso-rolagem";
import { buttonVariants } from "@/components/ui/button";

/**
 * Abertura da página: título curto e centralizado e, abaixo, o painel que mede uma voz de
 * exemplo. Ao rolar, o painel cresce até a largura total (como a vitrine de um instrumento).
 */
export function HeroVoz() {
  const palco = useRef<HTMLDivElement>(null);
  const p = useProgressoRolagem(palco, 0.25);
  const escala = 0.92 + 0.08 * p;

  return (
    <section aria-labelledby="hero-voz-title" className="relative isolate overflow-hidden px-5 pb-20 pt-32 sm:px-8 lg:pb-28 lg:pt-44">
      <div className="hud-grid absolute inset-x-0 top-0 -z-10 h-[38rem]" aria-hidden />
      <div className="mx-auto max-w-4xl text-center motion-safe:animate-fade-up">
        <h1 id="hero-voz-title" className="text-balance font-display text-5xl font-bold leading-[1.02] tracking-[-0.035em] text-ink sm:text-6xl xl:text-[5.25rem]">
          A voz inteira, <span className="text-accent">medida.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-ink/90 sm:text-xl">
          Avaliação acústica, fonetograma, terapia e treino de canto num só lugar — com números que
          conferem com o Praat e uma leitura que o paciente entende.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          <Link href="/register" className={buttonVariants({ size: "lg", className: "rounded-full px-7" })}>
            Criar conta grátis
          </Link>
          <a href="#avaliacao-clinica" className="inline-block py-2.5 text-base font-medium text-ink underline decoration-line underline-offset-8 transition-colors hover:decoration-accent">
            Ver a avaliação clínica
          </a>
        </div>
      </div>

      <div ref={palco} className="mx-auto mt-16 max-w-content lg:mt-20">
        <div
          className="origin-top transition-transform duration-100 ease-out will-change-transform"
          style={{ transform: `scale(${escala})`, opacity: 0.55 + 0.45 * p }}
        >
          <PainelAoVivo />
        </div>
        <p className="mt-4 text-center text-sm text-ink-muted">
          Espectrograma de banda estreita e F0 calculados pelas mesmas funções da avaliação clínica.
        </p>
      </div>
    </section>
  );
}
