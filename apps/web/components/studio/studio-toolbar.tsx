"use client";

import { BookmarkPlus, Focus, Repeat, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StudioToolbarProps = {
  zoom: number;
  loopOn: boolean;
  loopA: number;
  loopB: number;
  sideOpen: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetA: () => void;
  onSetB: () => void;
  onToggleLoop: () => void;
  onAddMarker: () => void;
  onToggleSide: () => void;
};

export function StudioToolbar({
  zoom,
  loopOn,
  loopA,
  loopB,
  sideOpen,
  onZoomIn,
  onZoomOut,
  onSetA,
  onSetB,
  onToggleLoop,
  onAddMarker,
  onToggleSide,
}: StudioToolbarProps) {
  return (
    <footer
      className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas-raised/90 px-4 py-2 md:px-5"
      role="toolbar"
      aria-label="Ferramentas do estúdio"
    >
      <ToolBtn label="Diminuir zoom" onClick={onZoomOut}>
        <ZoomOut className="h-4 w-4" />
      </ToolBtn>
      <span className="font-mono text-xs text-ink-faint">{zoom.toFixed(1)}×</span>
      <ToolBtn label="Aumentar zoom" onClick={onZoomIn}>
        <ZoomIn className="h-4 w-4" />
      </ToolBtn>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <ToolBtn label="Marcar loop A na posição atual" onClick={onSetA}>
        <span className="text-xs font-bold">A</span>
      </ToolBtn>
      <ToolBtn label="Marcar loop B na posição atual" onClick={onSetB}>
        <span className="text-xs font-bold">B</span>
      </ToolBtn>
      <ToolBtn
        label={loopOn ? "Desativar loop A–B" : "Ativar loop A–B"}
        pressed={loopOn}
        onClick={onToggleLoop}
      >
        <Repeat className="h-4 w-4" />
      </ToolBtn>
      <span className="font-mono text-xs text-ink-faint">
        {loopA.toFixed(1)}s–{loopB.toFixed(1)}s
      </span>
      <span className="mx-1 h-5 w-px bg-line" aria-hidden />
      <ToolBtn label="Adicionar marcador na posição atual" onClick={onAddMarker}>
        <BookmarkPlus className="h-4 w-4" />
      </ToolBtn>
      <div className="ml-auto">
        <ToolBtn label="Painel lateral" pressed={sideOpen} onClick={onToggleSide}>
          <Focus className="h-4 w-4" />
        </ToolBtn>
      </div>
    </footer>
  );
}

function ToolBtn({
  label,
  children,
  onClick,
  pressed,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "default" : "ghost"}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(disabled && "opacity-40")}
      title={label}
    >
      {children}
    </Button>
  );
}
