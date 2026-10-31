"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Stethoscope, Users } from "lucide-react";

import { cn } from "@/lib/utils";

const ITENS = [
  { href: "/voz-clinica", rotulo: "Avaliação", icone: Stethoscope },
  { href: "/voz-clinica/pacientes", rotulo: "Pacientes", icone: Users },
  { href: "/voz-clinica/agenda", rotulo: "Agenda", icone: CalendarDays },
] as const;

/** Atalhos entre as três telas da área clínica. */
export function NavegacaoClinica({ className }: { className?: string }) {
  const atual = usePathname();
  return (
    <nav aria-label="Área clínica" className={cn("flex flex-wrap gap-1", className)}>
      {ITENS.map(({ href, rotulo, icone: Icone }) => {
        const ativo = atual === href;
        return (
          <Link key={href} href={href} aria-current={ativo ? "page" : undefined} data-testid={`vc2-nav-${rotulo.toLowerCase()}`}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              ativo ? "bg-accent/15 text-ink ring-1 ring-inset ring-accent/40" : "text-ink-muted hover:bg-ink/[0.05] hover:text-ink",
            )}>
            <Icone className="h-4 w-4" aria-hidden /> {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
