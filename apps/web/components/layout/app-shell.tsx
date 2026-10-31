"use client";

import { useEffect, useState } from "react";

import { AvisoPrivacidade } from "@/components/layout/aviso-privacidade";
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
  // celular/tablet estreito: o menu vira gaveta e, fechado, sai da ordem do Tab
  const [estreito, setEstreito] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const sync = () => setEstreito(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Gaveta aberta: foco no primeiro link, Esc fecha e devolve o foco ao botão do menu
  useEffect(() => {
    if (!menuOpen) return;
    const botao = document.querySelector<HTMLElement>('[aria-controls="app-sidebar"]');
    document.querySelector<HTMLElement>("#app-sidebar nav a")?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        botao?.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [menuOpen]);

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
        inert={estreito && !menuOpen}
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
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <AvisoPrivacidade />
          {children}
        </main>
        {isAdmin ? <LocalStatusFooter /> : null}
      </div>
    </div>
  );
}
