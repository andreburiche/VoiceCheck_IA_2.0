"use client";

import { HelpCircle } from "lucide-react";

type Props = {
  label: string;
  children: string;
};

/** Explicação breve acessível (title + texto para leitores de tela). */
export function InfoHint({ label, children }: Props) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="sr-only" id={`${label}-hint`}>
        {children}
      </span>
      <button
        type="button"
        className="inline-flex rounded p-0.5 text-ink-faint hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        title={children}
        aria-label={`Ajuda: ${label}`}
        aria-describedby={`${label}-hint`}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}
