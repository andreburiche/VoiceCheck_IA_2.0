"use client";

import { useEffect, useRef } from "react";

type TransportHandlers = {
  enabled?: boolean;
  onTogglePlay: () => void;
  onStop?: () => void;
  onToggleLoop?: () => void;
  /** Avança/volta N segundos a partir da posição atual. */
  onSeekBy?: (deltaSec: number) => void;
};

/**
 * O campo focado já usa esta tecla? Texto usa tudo; sliders, selects e radios usam setas e Home
 * (mover o controle pelo teclado); caixas de seleção usam Espaço.
 */
function fieldOwnsKey(el: EventTarget | null, key: string): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  const nav = key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End";
  if (el.tagName === "SELECT") return true;
  if (el.getAttribute("role") === "slider" || el.getAttribute("role") === "radio") return nav;
  if (el.tagName === "INPUT") {
    const type = (el as HTMLInputElement).type;
    if (type === "range" || type === "radio") return nav;
    if (type === "checkbox") return key === " " || key === "Spacebar";
    return true;
  }
  return false;
}

/**
 * Atalhos de transporte (estilo DAW): Espaço = tocar/pausar, L = loop,
 * ←/→ = 5 s (Shift = 1 s), Home = voltar ao início.
 * Ignorados enquanto o usuário digita ou com Ctrl/Cmd/Alt pressionados.
 */
export function useTransportShortcuts(handlers: TransportHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const h = ref.current;
      if (h.enabled === false || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (fieldOwnsKey(e.target, e.key)) return;
      if (document.querySelector("dialog[open]")) return;
      // botões já tratam Espaço como clique — não disparar duas vezes
      const onButton = e.target instanceof HTMLElement && e.target.closest("button, a[href]");

      if (e.code === "Space" && !onButton) {
        e.preventDefault();
        h.onTogglePlay();
      } else if ((e.key === "l" || e.key === "L") && h.onToggleLoop) {
        e.preventDefault();
        h.onToggleLoop();
      } else if (e.key === "ArrowRight" && h.onSeekBy) {
        e.preventDefault();
        h.onSeekBy(e.shiftKey ? 1 : 5);
      } else if (e.key === "ArrowLeft" && h.onSeekBy) {
        e.preventDefault();
        h.onSeekBy(e.shiftKey ? -1 : -5);
      } else if (e.key === "Home" && h.onStop) {
        e.preventDefault();
        h.onStop();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Texto curto para mostrar os atalhos na interface. */
export const TRANSPORT_SHORTCUTS_HINT = "Atalhos: Espaço tocar/pausar · L loop · ← → 5 s · Home início";
