"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { authApi } from "@/lib/api";

/** Dados de saúde de pacientes: só fonoaudiólogo (a API também recusa). */
export function PortaoClinico({ children }: { children: React.ReactNode }) {
  const me = useQuery({ queryKey: ["me"], queryFn: () => authApi.me() });
  if (me.data && !me.data.acesso_clinico) {
    // dados de saúde de pacientes: só fonoaudiólogo (a API também recusa)
    return (
      <div className="page-shell">
        <div className="mx-auto mt-10 max-w-xl rounded-2xl bg-canvas-raised/60 p-8 text-center ring-1 ring-inset ring-ink/10" data-testid="vc2-sem-acesso">
          <Stethoscope className="mx-auto h-8 w-8 text-accent" aria-hidden />
          <h1 className="mt-4 font-display text-2xl font-bold tracking-[-0.02em] text-ink">A avaliação clínica é para fonoaudiólogos</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Ela guarda dados de saúde de pacientes. Se você é fonoaudiólogo(a), escolha esse perfil em Meu perfil e informe o
            número do seu registro no conselho (CRFa).
          </p>
          <Link href="/perfil" className={buttonVariants({ className: "mt-6" })}>Ir para Meu perfil</Link>
        </div>
      </div>
    );
  }
  return <div className="page-shell">{children}</div>;
}
