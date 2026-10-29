"use client";

import { useEffect, useState } from "react";

/**
 * URL temporária (blob:) para um Blob, revogada ao trocar/desmontar.
 * Criada no efeito — com useMemo o StrictMode revogaria a URL ainda em uso.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
