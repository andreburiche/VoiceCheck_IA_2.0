"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type ModalProps = {
  /** Fecha com Esc, clique no fundo ou pelo botão de cancelar do conteúdo. */
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Janela modal sobre <dialog> nativo (montada só enquanto aberta): foco preso,
 * Esc fecha, fica na camada superior e devolve o foco a quem abriu.
 */
export function Modal({ onClose, labelledBy, className, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dlg.open) dlg.showModal();
    return () => {
      if (dlg.open) dlg.close();
      opener?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="fixed inset-0 !m-auto h-fit max-h-[85vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-canvas-raised p-0 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop:bg-black/60"
    >
      <div className={cn("p-5", className)}>{children}</div>
    </dialog>
  );
}
