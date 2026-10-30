"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Progresso (0 → 1) de um elemento entrando na tela: 0 quando o topo dele aparece embaixo,
 * 1 quando chega a `fim` da altura da janela. Com reduced-motion, fica sempre em 1.
 * Atualiza num quadro de animação por rolagem (sem layout em excesso).
 */
export function useProgressoRolagem(ref: RefObject<HTMLElement | null>, fim = 0.35): number {
  const [p, setP] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let pedido = 0;
    const medir = () => {
      pedido = 0;
      const r = el.getBoundingClientRect();
      const h = window.innerHeight;
      const v = (h - r.top) / (h * (1 - fim));
      setP(Math.max(0, Math.min(1, v)));
    };
    const agendar = () => { if (!pedido) pedido = requestAnimationFrame(medir); };
    medir();
    window.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => { window.removeEventListener("scroll", agendar); window.removeEventListener("resize", agendar); cancelAnimationFrame(pedido); };
  }, [ref, fim]);
  return p;
}
