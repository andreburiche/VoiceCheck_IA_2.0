"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, LogOut, Settings, Shield, UserRound } from "lucide-react";

import { ROTULO_PERFIL, authApi, perfilApi } from "@/lib/api";

/** Menu da conta (avatar): quem está conectado, Configurações e Sair num só lugar. */
export function AccountMenu({ userName, onLogout }: { userName?: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const me = useQuery({ queryKey: ["me"], queryFn: () => authApi.me() });
  const name = me.data?.name ?? userName ?? "";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const isAdmin = me.data?.role === "admin";
  const temFoto = !!me.data?.tem_foto;
  const [foto, setFoto] = useState<string | null>(null);

  // foto do profissional no avatar (blob com o cookie de sessão)
  useEffect(() => {
    if (!temFoto) { setFoto(null); return; }
    let vivo = true;
    let url: string | null = null;
    perfilApi.foto().then((b) => {
      if (!vivo || !b) return;
      url = URL.createObjectURL(b);
      setFoto(url);
    }).catch(() => undefined);
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [temFoto, me.dataUpdatedAt]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    // foco no primeiro item ao abrir
    window.requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onMenuKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    (items[next] as HTMLElement | undefined)?.focus();
  }

  const item =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-canvas-card hover:text-ink focus-visible:bg-canvas-card focus-visible:text-ink focus-visible:outline-none";

  return (
    <div ref={rootRef} className="relative" onKeyDown={onMenuKey}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Conta de ${name || "usuário"}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-full pl-0.5 pr-2 text-ink-muted transition-colors hover:bg-canvas-overlay hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-accent/15 text-sm font-semibold text-accent">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob local */}
          {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : initial}
        </span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Conta"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden rounded-xl border border-line bg-canvas-overlay py-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]"
        >
          <div className="border-b border-line/70 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{name || "Sua conta"}</p>
            {me.data?.email ? <p className="truncate text-xs text-ink-muted">{me.data.email}</p> : null}
            {me.data?.perfil ? <p className="mt-0.5 truncate text-xs text-accent">{ROTULO_PERFIL[me.data.perfil]}</p> : null}
          </div>
          <div className="py-1">
            <Link role="menuitem" href="/perfil" className={item} onClick={() => setOpen(false)}>
              <UserRound className="h-4 w-4" aria-hidden />
              Meu perfil
            </Link>
            <Link role="menuitem" href="/settings" className={item} onClick={() => setOpen(false)}>
              <Settings className="h-4 w-4" aria-hidden />
              Configurações
            </Link>
            {isAdmin ? (
              <Link role="menuitem" href="/admin" className={item} onClick={() => setOpen(false)}>
                <Shield className="h-4 w-4" aria-hidden />
                Administração
              </Link>
            ) : null}
          </div>
          <div className="border-t border-line/70 py-1">
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sair
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
