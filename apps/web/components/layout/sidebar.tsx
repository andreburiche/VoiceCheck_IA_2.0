"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioWaveform,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  Library,
  Settings,
  Shield, LifeBuoy } from "lucide-react";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { LogoMark } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";

/** Mobile drawer sempre expandido; desktop herda largura do shell (`md:w-full`). */
const SIDEBAR_WIDTH = "w-[15.5rem] md:w-full";

const primaryLinks = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/projects", label: "Minhas músicas", icon: FolderOpen },
  { href: "/library", label: "Biblioteca e setlists", icon: Library },
  { href: "/voicecheck", label: "Diagnóstico vocal", icon: AudioWaveform },
];

const labLinks = [
  { href: "/settings", label: "Configurações", icon: Settings },
  { href: "/ajuda", label: "Ajuda", icon: LifeBuoy },
];

type SidebarProps = {
  isAdmin?: boolean;
  mobileOpen?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
};

export function Sidebar({
  isAdmin = false,
  mobileOpen = false,
  collapsed = false,
  onCollapsedChange,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  // Telas de sistema (modelos instalados, auditoria) ficam só para administradores
  const adminLinks = isAdmin
    ? [
        { href: "/models", label: "Modelos de IA", icon: BrainCircuit },
        { href: "/admin", label: "Administração", icon: Shield },
      ]
    : [];

  // Drawer mobile sempre com labels; rail só no desktop
  const rail = collapsed && !mobileOpen;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-white/[0.06]",
        "bg-canvas-raised/75 backdrop-blur-xl",
        "transition-transform duration-300 ease-out motion-reduce:transition-none md:transition-none",
        "md:sticky md:top-0 md:h-screen md:translate-x-0",
        SIDEBAR_WIDTH,
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      )}
      aria-label="Navegação do aplicativo"
      data-collapsed={rail ? "true" : "false"}
    >
      <div
        className={cn(
          "relative flex h-[4.25rem] items-center overflow-hidden border-b border-white/[0.06]",
          rail ? "justify-center px-1.5" : "px-4",
        )}
      >
        {rail ? (
          <Link
            href="/dashboard"
            className="relative z-[1] inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label="VoiceCheck IA — Painel"
            onClick={onNavigate}
          >
            <LogoMark size="sm" />
          </Link>
        ) : (
          <BrandLockup href="/dashboard" variant="full" size="md" className="relative z-[1] min-w-0 max-w-full" />
        )}
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col overflow-y-auto overflow-x-hidden py-4",
          rail ? "gap-4 px-1.5" : "gap-6 px-3",
        )}
        aria-label="Principal"
      >
        <NavGroup label="Estúdio" links={primaryLinks} pathname={pathname} collapsed={rail} onNavigate={onNavigate} />
        <NavGroup
          label="Sistema"
          links={[...labLinks, ...adminLinks]}
          pathname={pathname}
          collapsed={rail}
          onNavigate={onNavigate}
        />
      </nav>

      <div className={cn("border-t border-white/[0.06]", rail ? "p-1.5" : "p-3")}>
        <button
          type="button"
          className={cn(
            "hidden h-10 w-full items-center gap-2 rounded-lg px-3 text-xs text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 md:inline-flex",
            rail && "justify-center px-0",
          )}
          onClick={() => onCollapsedChange?.(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {rail ? (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
              Recolher menu
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function NavGroup({
  label,
  links,
  pathname,
  collapsed,
  onNavigate,
}: {
  label: string;
  links: { href: string; label: string; icon: ComponentType<{ className?: string }> }[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  if (links.length === 0) return null;
  return (
    <div>
      {!collapsed ? <p className="hud-label mb-2 px-3">{label}</p> : <p className="sr-only">{label}</p>}
      <div className="flex flex-col gap-0.5">
        {links.map(({ href, label: itemLabel, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              title={collapsed ? itemLabel : undefined}
              className={cn(
                "group relative flex items-center rounded-lg text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                collapsed ? "h-10 w-full justify-center px-0" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-accent/10 font-medium text-ink"
                  : "text-ink-muted hover:bg-white/[0.04] hover:text-ink",
              )}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? itemLabel : undefined}
            >
              {active ? (
                <span
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                  aria-hidden
                />
              ) : null}
              <Icon
                className={cn(
                  "h-[1.125rem] w-[1.125rem] shrink-0",
                  active ? "text-accent" : "text-ink-faint group-hover:text-ink-muted",
                )}
                aria-hidden
              />
              {!collapsed ? <span className="min-w-0 truncate leading-snug">{itemLabel}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
