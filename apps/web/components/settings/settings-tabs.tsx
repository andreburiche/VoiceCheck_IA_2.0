"use client";

import { cn } from "@/lib/utils";

export const SETTINGS_TABS = [
  { id: "geral", label: "Geral" },
  { id: "audio", label: "Áudio" },
  { id: "processamento", label: "Processamento" },
  { id: "hardware", label: "Hardware" },
  { id: "armazenamento", label: "Armazenamento" },
  { id: "aparencia", label: "Aparência" },
  { id: "atualizacoes", label: "Atualizações" },
  { id: "sobre", label: "Sobre" },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

/** Abas de diagnóstico do servidor: só para administradores. */
export const ADMIN_SETTINGS_TABS: SettingsTabId[] = ["processamento", "hardware", "atualizacoes"];

type Props = {
  current: SettingsTabId;
  onChange: (id: SettingsTabId) => void;
  isAdmin?: boolean;
};

export function SettingsTabs({ current, onChange, isAdmin }: Props) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-line pb-px lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:border-b-0 lg:pb-0"
      aria-label="Seções de configurações"
      role="tablist"
    >
      {SETTINGS_TABS.filter((t) => isAdmin || !ADMIN_SETTINGS_TABS.includes(t.id)).map((tab) => {
        const active = tab.id === current;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 rounded-t-xl px-3 py-2 text-left text-sm transition-colors lg:rounded-xl",
              active
                ? "border border-b-transparent border-line bg-canvas-raised text-accent lg:border-accent/30 lg:bg-accent/10"
                : "text-ink-muted hover:text-ink lg:hover:bg-canvas-raised/70",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
