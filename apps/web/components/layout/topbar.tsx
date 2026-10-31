"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Menu, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react";

import { LiveBadge } from "@/components/hud";
import { AccountMenu } from "@/components/layout/account-menu";
import { SeletorTema } from "@/components/layout/seletor-tema";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi, usageApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type TopbarProps = {
  userName?: string;
  onMenuToggle?: () => void;
  menuOpen?: boolean;
  sidebarCollapsed?: boolean;
  onSidebarCollapseToggle?: () => void;
};

const iconButton =
  "inline-flex h-9 w-9 toque:h-11 toque:w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

export function Topbar({
  userName,
  onMenuToggle,
  menuOpen,
  sidebarCollapsed,
  onSidebarCollapseToggle,
}: TopbarProps) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const usage = useQuery({
    queryKey: ["usage"],
    queryFn: () => usageApi.me(),
    refetchInterval: 15_000,
  });

  const jobs = usage.data?.concurrent_jobs ?? 0;
  const processing = jobs > 0;

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {
      /* sessão já inválida */
    }
    router.push("/login");
    router.refresh();
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) {
      router.push("/library");
      return;
    }
    router.push(`/library?q=${encodeURIComponent(term)}`);
  }

  return (
    <header className="sticky top-0 z-30 flex h-[4.25rem] items-center gap-3 border-b border-ink/[0.06] bg-canvas/70 px-3 backdrop-blur-xl md:px-6">
      <button
        type="button"
        className={cn(iconButton, "md:hidden")}
        onClick={onMenuToggle}
        aria-expanded={menuOpen}
        aria-controls="app-sidebar"
        aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
      >
        {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>

      <button
        type="button"
        className={cn(iconButton, "hidden md:inline-flex")}
        onClick={onSidebarCollapseToggle}
        aria-expanded={!sidebarCollapsed}
        aria-controls="app-sidebar"
        aria-label={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
        title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-5 w-5" aria-hidden />
        ) : (
          <PanelLeftClose className="h-5 w-5" aria-hidden />
        )}
      </button>

      <form onSubmit={onSearch} className="relative hidden w-full max-w-md flex-1 sm:block" role="search">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <Input
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar músicas, faixas, setlists…"
          className="border-ink/[0.08] bg-ink/[0.03] pl-9"
          aria-label="Busca global"
        />
      </form>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <span role="status" aria-live="polite" className="hidden lg:inline-flex">
          <LiveBadge
            active={processing}
            label={processing ? `${jobs} ${jobs === 1 ? "processamento" : "processamentos"} em andamento` : "Pronto"}
          />
        </span>

        <Link href="/projects?new=1" className={buttonVariants({ size: "sm", className: "h-9 rounded-lg px-3.5" })}>
          <Plus className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Nova música</span>
          <span className="sm:hidden">Nova</span>
        </Link>

        <SeletorTema />
        <AccountMenu userName={userName} onLogout={() => void handleLogout()} />
      </div>
    </header>
  );
}
