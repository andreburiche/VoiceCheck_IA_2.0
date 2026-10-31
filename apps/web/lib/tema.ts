/**
 * Tema claro / escuro do VoiceCheck IA.
 *
 * Preferência guardada neste navegador ("claro", "escuro" ou "sistema"), aplicada em
 * html[data-theme="light"|"dark"]. As cores do Tailwind vêm de variáveis CSS (globals.css),
 * então quase tudo muda sozinho; gráficos em <canvas> leem as cores com `corTema` e se
 * redesenham com `useTemaAtivo`.
 */
import { useEffect, useState } from "react";

export type PreferenciaTema = "escuro" | "claro" | "sistema";
export type TemaAtivo = "escuro" | "claro";

export { CHAVE_TEMA, SCRIPT_TEMA } from "@/lib/tema-script";
import { CHAVE_TEMA } from "@/lib/tema-script";
export const EVENTO_TEMA = "vc-tema";

export function lerPreferencia(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return v === "claro" || v === "sistema" ? v : "escuro";
  } catch {
    return "escuro";
  }
}

export function resolverTema(p: PreferenciaTema, sistemaClaro: boolean): TemaAtivo {
  return p === "sistema" ? (sistemaClaro ? "claro" : "escuro") : p;
}

function sistemaClaro(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches === true;
}

export function temaAtivo(): TemaAtivo {
  if (typeof document === "undefined") return "escuro";
  return document.documentElement.dataset.theme === "light" ? "claro" : "escuro";
}

/** Aplica no <html>. `suave` liga uma transição curta de cores (só na troca feita pelo usuário). */
export function aplicarTema(p: PreferenciaTema = lerPreferencia(), suave = false): TemaAtivo {
  const t = resolverTema(p, sistemaClaro());
  if (typeof document === "undefined") return t;
  const root = document.documentElement;
  if (suave && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("tema-transicao");
    window.setTimeout(() => root.classList.remove("tema-transicao"), 320);
  }
  root.dataset.theme = t === "claro" ? "light" : "dark";
  root.style.colorScheme = t === "claro" ? "light" : "dark";
  window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: t }));
  return t;
}

export function salvarPreferencia(p: PreferenciaTema): TemaAtivo {
  try {
    localStorage.setItem(CHAVE_TEMA, p);
  } catch {
    /* navegação anônima: vale só nesta aba */
  }
  return aplicarTema(p, true);
}

/**
 * Script que roda no <head> antes da página aparecer: evita o "piscar" do tema errado.
 * (Mesma regra de `lerPreferencia`/`resolverTema`, sem depender do bundle.)
 */

/** Tema ativo, atualizado quando o usuário troca (ou o sistema muda, na preferência "sistema"). */
export function useTemaAtivo(): TemaAtivo {
  const [t, setT] = useState<TemaAtivo>("escuro");
  useEffect(() => {
    setT(temaAtivo());
    const aoTrocar = () => setT(temaAtivo());
    window.addEventListener(EVENTO_TEMA, aoTrocar);
    return () => window.removeEventListener(EVENTO_TEMA, aoTrocar);
  }, []);
  return t;
}

/** Preferência + troca, para os seletores de tema. Segue o sistema ao vivo quando "sistema". */
export function usePreferenciaTema(): [PreferenciaTema, (p: PreferenciaTema) => void] {
  const [p, setP] = useState<PreferenciaTema>("escuro");
  useEffect(() => {
    setP(lerPreferencia());
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const aoMudarSistema = () => { if (lerPreferencia() === "sistema") aplicarTema("sistema"); };
    const aoTrocar = () => setP(lerPreferencia());
    mq?.addEventListener?.("change", aoMudarSistema);
    window.addEventListener(EVENTO_TEMA, aoTrocar);
    return () => {
      mq?.removeEventListener?.("change", aoMudarSistema);
      window.removeEventListener(EVENTO_TEMA, aoTrocar);
    };
  }, []);
  return [p, (novo) => { setP(novo); salvarPreferencia(novo); }];
}

/**
 * Cor do tema para <canvas> (que não entende var()): nome da variável sem "--c-"
 * ("ink-muted", "accent"...) e opacidade. Ex.: corTema("line", 0.5) → "rgb(38 50 71 / 0.5)".
 */
export function corTema(nome: string, alfa = 1): string {
  if (typeof document === "undefined") return `rgb(0 0 0 / ${alfa})`;
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${nome}`).trim();
  return v ? `rgb(${v} / ${alfa})` : `rgb(128 128 128 / ${alfa})`;
}
