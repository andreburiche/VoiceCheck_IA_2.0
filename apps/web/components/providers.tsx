"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { applyAppearance, loadAppSettings } from "@/lib/app-settings";
import { aplicarTema, lerPreferencia } from "@/lib/tema";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  // Preferências de aparência (reduzir movimento, compacto) valem desde a abertura do app
  useEffect(() => {
    applyAppearance(loadAppSettings());
    aplicarTema();
    // na preferência "sistema", acompanha a troca de claro/escuro do computador ou celular
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const aoMudar = () => { if (lerPreferencia() === "sistema") aplicarTema("sistema"); };
    mq?.addEventListener?.("change", aoMudar);
    return () => mq?.removeEventListener?.("change", aoMudar);
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
