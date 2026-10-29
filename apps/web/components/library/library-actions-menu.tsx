"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Dumbbell,
  Download,
  FolderPlus,
  ListMusic,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
  Waves,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LibraryActionsMenuProps = {
  isFavorite: boolean;
  canStudio: boolean;
  canExport: boolean;
  canReprocess: boolean;
  showCollect?: boolean;
  showSetlist?: boolean;
  onOpenStudio: () => void;
  onPractice: () => void;
  onReprocess: () => void;
  onExport: () => void;
  onRename: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onCollect?: () => void;
  onAddToSetlist?: () => void;
};

export function LibraryActionsMenu({
  isFavorite,
  canStudio,
  canExport,
  canReprocess,
  showCollect,
  showSetlist,
  onOpenStudio,
  onPractice,
  onReprocess,
  onExport,
  onRename,
  onToggleFavorite,
  onDelete,
  onCollect,
  onAddToSetlist,
}: LibraryActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(fn: () => void) {
    setOpen(false);
    fn();
  }

  const items: Array<{
    label: string;
    icon: typeof Waves;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
  }> = [
    { label: "Abrir no Estúdio", icon: Waves, onClick: onOpenStudio, disabled: !canStudio },
    { label: "Treinar", icon: Dumbbell, onClick: onPractice, disabled: !canStudio },
    { label: "Reprocessar", icon: RefreshCw, onClick: onReprocess, disabled: !canReprocess },
    { label: "Exportar", icon: Download, onClick: onExport, disabled: !canExport },
    { label: "Renomear", icon: Pencil, onClick: onRename },
    {
      label: isFavorite ? "Remover dos favoritos" : "Favoritar",
      icon: Star,
      onClick: onToggleFavorite,
    },
  ];

  if (showCollect && onCollect) {
    items.push({ label: "Adicionar à coleção", icon: FolderPlus, onClick: onCollect });
  }
  if (showSetlist && onAddToSetlist) {
    items.push({ label: "Adicionar à setlist", icon: ListMusic, onClick: onAddToSetlist });
  }

  items.push({ label: "Excluir", icon: Trash2, onClick: onDelete, danger: true });

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Ações do projeto"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          className="panel-glass absolute right-0 z-20 mt-1 min-w-[12rem] overflow-hidden rounded-xl py-1"
        >
          {items.map(({ label, icon: Icon, onClick, disabled, danger }) => (
            <li key={label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => run(onClick)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  danger ? "text-signal-err hover:bg-signal-err/10" : "text-ink hover:bg-canvas-overlay",
                  disabled && "cursor-not-allowed opacity-40",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
