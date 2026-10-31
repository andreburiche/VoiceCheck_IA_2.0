"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePreferenciaTema, type PreferenciaTema } from "@/lib/tema";

const OPCOES: { id: PreferenciaTema; rotulo: string; icone: typeof Sun }[] = [
  { id: "claro", rotulo: "Claro", icone: Sun },
  { id: "escuro", rotulo: "Escuro", icone: Moon },
  { id: "sistema", rotulo: "Do sistema", icone: Monitor },
];

/**
 * Seletor de tema. `icone`: botão quadrado com menu (barra do topo, cabeçalhos);
 * `segmentos`: três opções lado a lado (Configurações, menu da conta).
 */
export function SeletorTema({ modo = "icone", className }: { modo?: "icone" | "segmentos"; className?: string }) {
  const [pref, mudar] = usePreferenciaTema();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", tecla); };
  }, [aberto]);

  if (modo === "segmentos") {
    return (
      <div role="radiogroup" aria-label="Tema" className={cn("inline-flex rounded-lg bg-canvas-overlay p-0.5 ring-1 ring-inset ring-line", className)}>
        {OPCOES.map(({ id: op, rotulo, icone: Icone }) => (
          <button key={op} type="button" role="radio" aria-checked={pref === op} onClick={() => mudar(op)}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              pref === op ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/40" : "text-ink-muted hover:text-ink")}
            data-testid={`tema-${op}`}>
            <Icone className="h-3.5 w-3.5" aria-hidden /> {rotulo}
          </button>
        ))}
      </div>
    );
  }

  const Atual = OPCOES.find((o) => o.id === pref)?.icone ?? Moon;
  return (
    <div ref={raiz} className={cn("relative", className)}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-haspopup="menu" aria-expanded={aberto} aria-controls={id}
        title="Tema: claro, escuro ou do sistema" aria-label="Escolher tema (claro ou escuro)"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        data-testid="tema-botao">
        <Atual className="h-[1.1rem] w-[1.1rem]" aria-hidden />
      </button>
      {aberto ? (
        <div id={id} role="menu" aria-label="Tema"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-44 overflow-hidden rounded-xl border border-line bg-canvas-raised py-1 shadow-panel">
          {OPCOES.map(({ id: op, rotulo, icone: Icone }) => (
            <button key={op} type="button" role="menuitemradio" aria-checked={pref === op}
              onClick={() => { mudar(op); setAberto(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-canvas-overlay hover:text-ink focus-visible:bg-canvas-overlay focus-visible:text-ink focus-visible:outline-none"
              data-testid={`tema-menu-${op}`}>
              <Icone className="h-4 w-4" aria-hidden />
              <span className="flex-1">{rotulo}</span>
              {pref === op ? <Check className="h-4 w-4 text-accent" aria-hidden /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
