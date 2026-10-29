"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { authApi } from "@/lib/api";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(),
    retry: false,
  });

  useEffect(() => {
    if (isError) router.replace("/login");
  }, [isError, router]);

  if (isLoading || !data) {
    return (
      // Esqueleto no formato do app (menu + barra + conteúdo): sem "pulo" quando a sessão carrega
      <div className="flex min-h-screen bg-canvas" aria-busy="true">
        <span className="sr-only" role="status">
          Carregando sua conta…
        </span>
        <div className="hidden w-[15.5rem] shrink-0 border-r border-line/60 bg-canvas-raised md:block" aria-hidden>
          <div className="m-4 h-10 w-36 animate-pulse rounded-lg bg-white/[0.05]" />
          <div className="mt-8 space-y-2 px-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        </div>
        <div className="flex-1" aria-hidden>
          <div className="h-[4.25rem] border-b border-line/60" />
          <div className="space-y-6 p-4 md:p-8">
            <div className="h-8 w-56 animate-pulse rounded-lg bg-white/[0.05]" />
            <div className="h-40 animate-pulse rounded-2xl bg-white/[0.035]" />
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.035]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell userName={data.name} isAdmin={data.role === "admin"}>
      {children}
    </AppShell>
  );
}
