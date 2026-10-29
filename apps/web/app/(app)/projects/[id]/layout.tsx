"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { projectsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Navegação persistente dentro de uma música: um só "voltar" (para a lista) e abas
 * para cada ferramenta — o usuário sempre sabe onde está e troca de módulo sem voltar ao hub.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const pathname = usePathname() ?? "";
  const project = useQuery({ queryKey: ["project", id], queryFn: () => projectsApi.get(id) });

  const base = `/projects/${id}`;
  const tabs = [
    { href: base, label: "Visão geral", exact: true },
    { href: `${base}/studio`, label: "Estúdio" },
    { href: `${base}/practice`, label: "Treino" },
    { href: `${base}/analysis`, label: "Análise" },
    { href: `${base}/vocal-lab`, label: "Laboratório vocal" },
    { href: `${base}/export`, label: "Exportar" },
  ];

  return (
    <div className="space-y-6">
      <nav aria-label="Ferramentas da música" className="page-shell">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link
            href="/projects"
            className="-ml-1.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-ink-muted transition-colors duration-ui hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Minhas músicas
          </Link>
          <span className="text-ink-faint" aria-hidden>
            /
          </span>
          <span className="truncate font-medium text-ink" title={project.data?.name}>
            {project.data?.name ?? "…"}
          </span>
        </div>
        <ul className="-mb-px mt-3 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <li key={t.href} className="shrink-0">
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                    active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}
