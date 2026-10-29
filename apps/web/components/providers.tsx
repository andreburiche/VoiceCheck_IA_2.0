"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { applyAppearance, loadAppSettings } from "@/lib/app-settings";

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
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
