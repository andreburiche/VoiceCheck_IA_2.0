"use client";

import { useEffect, useState } from "react";

import { LocalStatusFooter } from "@/components/layout/local-status-footer";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "va_sidebar_collapsed";

type AppShellProps = {
  children: React.ReactNode;
  userName?: string;
  isAdmin?: boolean;
  acessoClinico?: boolean;
};

export function AppShell({ children, userName, isAdmin, acessoClinico }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  function onCollapsedChange(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative flex min-h-screen bg-transparent text-ink">
      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div
        id="app-sidebar"
        className={cn(
          "shrink-0 transition-[width] duration-300 ease-out motion-reduce:transition-none",
          // Reserva largura no desktop antes/depois do hydrate (evita salto de layout)
          !hydrated || !collapsed ? "md:w-[15.5rem]" : "md:w-[4.25rem]",
        )}
      >
        <Sidebar
          isAdmin={isAdmin}
          acessoClinico={acessoClinico}
          mobileOpen={menuOpen}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
          onNavigate={() => setMenuOpen(false)}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          userName={userName}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((v) => !v)}
          sidebarCollapsed={collapsed}
          onSidebarCollapseToggle={() => onCollapsedChange(!collapsed)}
        />
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        {isAdmin ? <LocalStatusFooter /> : null}
      </div>
    </div>
  );
}
