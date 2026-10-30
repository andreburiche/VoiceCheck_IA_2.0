"use client";

import { useEffect, useRef, useState } from "react";

/** Números do produto (fatos verificáveis, não estatísticas de uso). */
const NUMEROS = [
  { valor: 52, casas: 0, unidade: "funções", legenda: "de seis programas de voz, numa só plataforma" },
  { valor: 13, casas: 0, unidade: "áreas", legenda: "da anamnese ao relatório, na mesma tela do paciente" },
  { valor: 0.21, casas: 2, unidade: "dB", legenda: "diferença média do CPPS para o Praat, em vozes de teste" },
  { valor: 30, casas: 0, unidade: "cm", legenda: "dB SPL calibrado com decibelímetro, como pede o DSI" },
] as const;

function formatar(v: number, casas: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Faixa de números grandes; contam a partir de zero quando entram na tela (uma vez). */
export function Numeros() {
  const ref = useRef<HTMLDListElement>(null);
  const [p, setP] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return; // já à vista: sem contagem
    setP(0);
    let quadro = 0;
    const io = new IntersectionObserver((entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const t0 = performance.now();
      const passo = (agora: number) => {
        const x = Math.min(1, (agora - t0) / 1100);
        setP(1 - (1 - x) ** 3);
        if (x < 1) quadro = requestAnimationFrame(passo);
      };
      quadro = requestAnimationFrame(passo);
    }, { rootMargin: "0px 0px -15% 0px" });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(quadro); };
  }, []);

  return (
    <section aria-label="A plataforma em números" className="border-y border-line/70 bg-canvas-raised">
      <dl ref={ref} className="mx-auto grid max-w-content grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">
        {NUMEROS.map((n, i) => (
          <div
            key={n.legenda}
            className={`flex flex-col-reverse py-8 lg:py-12 ${i % 2 === 1 ? "pl-5 sm:pl-8" : ""} ${i > 0 ? "lg:border-l lg:border-line/70 lg:pl-8" : ""} ${i >= 2 ? "border-t border-line/70 lg:border-t-0" : ""}`}
          >
            <dt className="mt-2 max-w-[16rem] text-sm leading-snug text-ink-muted">{n.legenda}</dt>
            <dd>
              <span className="text-data text-4xl font-semibold text-ink sm:text-5xl">{formatar(n.valor * p, n.casas)}</span>
              <span className="text-data ml-1.5 text-sm text-accent">{n.unidade}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
