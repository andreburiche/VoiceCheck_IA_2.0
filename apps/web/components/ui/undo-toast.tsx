"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type UndoToastProps = {
  message: string;
  /** Some sozinho depois de N ms (padrão 8 s). */
  durationMs?: number;
  onUndo: () => Promise<void> | void;
  onClose: () => void;
};

/** Aviso na base da tela com "Desfazer" — para ações reversíveis, em vez de pedir confirmação longa. */
export function UndoToast({ message, durationMs = 8000, onUndo, onClose }: UndoToastProps) {
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const t = window.setTimeout(() => closeRef.current(), durationMs);
    return () => window.clearTimeout(t);
  }, [durationMs, message]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[90] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-canvas-overlay px-4 py-3 text-sm text-ink shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onUndo();
          } finally {
            setBusy(false);
            onClose();
          }
        }}
        className="shrink-0 rounded-md px-2 py-1 font-semibold text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        {busy ? "Desfazendo…" : "Desfazer"}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar aviso"
        className="shrink-0 rounded-md p-1 text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
