"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Se definido, exige digitar este texto para confirmar (use só para ações irreversíveis). */
  requireText?: string;
  confirmValue?: string;
  onConfirmValueChange?: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  danger?: boolean;
};

/**
 * Confirmação sobre <dialog> nativo: camada superior, foco preso dentro dela, Esc fecha
 * e o foco volta para quem abriu.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  requireText,
  confirmValue = "",
  onConfirmValueChange,
  onConfirm,
  onCancel,
  busy,
  danger,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const inputId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const canConfirm = !requireText || confirmValue.trim() === requireText;

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      dlg.showModal();
      // Ação destrutiva: foco no "Cancelar" (Enter não apaga sem querer)
      window.requestAnimationFrame(() => {
        (requireText ? inputRef.current : danger ? cancelRef.current : confirmRef.current)?.focus();
      });
    } else if (!open && dlg.open) {
      dlg.close();
      openerRef.current?.focus?.();
    }
  }, [open, requireText, danger]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descId}
      role={danger ? "alertdialog" : "dialog"}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        // clique no fundo (fora do cartão) cancela
        if (e.target === dialogRef.current && !busy) onCancel();
      }}
      className="fixed inset-0 !m-auto h-fit max-h-[85vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-canvas-raised p-0 text-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop:bg-black/60"
    >
      {open ? (
        <div className="p-5">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {title}
          </h2>
          <p id={descId} className="mt-2 text-sm leading-relaxed text-ink-muted">
            {description}
          </p>
          {requireText ? (
            <div className="mt-4 space-y-2">
              <label htmlFor={inputId} className="text-sm text-ink-muted">
                Digite <span className="font-medium text-ink">{requireText}</span> para confirmar
              </label>
              <Input
                ref={inputRef}
                id={inputId}
                value={confirmValue}
                onChange={(e) => onConfirmValueChange?.(e.target.value)}
                autoComplete="off"
              />
            </div>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button
              ref={confirmRef}
              type="button"
              variant={danger ? "danger" : "default"}
              onClick={onConfirm}
              disabled={!canConfirm || busy}
              aria-busy={busy}
            >
              {busy ? "Aguarde…" : confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
