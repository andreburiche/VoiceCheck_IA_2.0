"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Diferença média entre o motor interno e o Praat em vozes sintéticas de valor conhecido,
 * antes e depois da calibração (docs/CONCORDANCIA_MOTORES.md). Dados medidos, não ilustrativos.
 */
const MEDIDAS = [
  { nome: "Jitter", unidade: "p.p.", antes: 0.72, depois: 0.16 },
  { nome: "Shimmer", unidade: "p.p.", antes: 1.53, depois: 0.57 },
  { nome: "CPPS", unidade: "dB", antes: 1.37, depois: 0.21 },
  { nome: "HNR", unidade: "dB", antes: 1.89, depois: 0.23 },
] as const;
const ESCALA = 2;

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Precisão": barras que encolhem do erro antigo ao atual quando a seção entra na tela. */
export function Precisao() {
  const ref = useRef<HTMLUListElement>(null);
  const [calibrado, setCalibrado] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.8) return;
    setCalibrado(false);
    const io = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) { io.disconnect(); window.setTimeout(() => setCalibrado(true), 450); }
    }, { rootMargin: "0px 0px -20% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="precisao" aria-labelledby="precisao-title" className="scroll-mt-20 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto grid max-w-content gap-14 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <h2 id="precisao-title" className="text-balance font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-5xl">
            Números que conferem com o Praat
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink/90">
            Quando o Praat não está disponível, o motor interno assume — e foi ajustado para seguir o
            Praat em vozes sintéticas de valor conhecido e em vozes reais de um banco público. Os
            resultados dos dois motores nunca se misturam no histórico.
          </p>
          <p className="mt-4 text-sm text-ink-muted">Diferença média entre os motores, antes e depois do ajuste; p.p. = pontos percentuais. Menor é melhor.</p>
        </div>

        <ul ref={ref} className="grid content-center gap-7 lg:col-span-7" aria-label="Diferença média para o Praat, antes e depois do ajuste">
          {MEDIDAS.map((m, i) => {
            const v = calibrado ? m.depois : m.antes;
            return (
              <li key={m.nome}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-display text-xl font-semibold text-ink">{m.nome}</span>
                  <span>
                    <span className="text-data text-2xl font-semibold text-accent">{fmt(v)}</span>
                    <span className="text-data ml-1 text-xs text-ink-muted">{m.unidade}</span>
                    <span className="sr-only"> (antes do ajuste: {fmt(m.antes)} {m.unidade})</span>
                  </span>
                </div>
                <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-canvas-overlay">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-ink-faint/40" style={{ width: `${(m.antes / ESCALA) * 100}%` }} aria-hidden />
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-[1200ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]")}
                    style={{ width: `${(v / ESCALA) * 100}%`, transitionDelay: `${i * 120}ms` }}
                    aria-hidden
                  />
                </div>
                <p className="mt-1.5 text-xs text-ink-faint">antes do ajuste: <span className="text-data">{fmt(m.antes)}</span></p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
