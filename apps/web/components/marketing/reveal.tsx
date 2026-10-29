"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Entrada suave ao rolar (opacity + transform). O conteúdo nasce visível no
 * HTML do servidor; só depois de montado e fora da tela é escondido para
 * animar — se o JS falhar, nada fica invisível. Respeita reduced-motion.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<"idle" | "waiting" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rect = el.getBoundingClientRect();
    if (reduce || rect.top < window.innerHeight * 0.9) return; // já visível: não anima
    setState("waiting");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={cn(
        state !== "idle" && "transition-[opacity,transform] duration-700 ease-out",
        state === "waiting" && "translate-y-6 opacity-0",
        state === "shown" && "translate-y-0 opacity-100",
        className,
      )}
      style={state !== "idle" ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
