"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#avaliacao-clinica", label: "Avaliação clínica" },
  { href: "#precisao", label: "Precisão" },
  { href: "#para-quem", label: "Para quem" },
  { href: "#separacao", label: "Canto" },
  { href: "#privacidade", label: "Privacidade" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-ui",
        scrolled || open
          ? "border-b border-white/5 bg-canvas/75 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-[72px] max-w-content items-center justify-between gap-4 px-5 sm:px-8">
        <BrandLogo href="/" variant="light" size="md" layout="horizontal" />

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Principal">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-ink-muted transition-colors duration-ui hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 md:flex">
          <Link href="/login" className="text-sm text-ink transition-colors duration-ui hover:text-accent">
            Entrar
          </Link>
          <Link href="/register" className={buttonVariants({ size: "default", className: "rounded-full px-5" })}>
            Criar conta
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink transition-colors hover:bg-canvas-overlay lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {open ? (
        <nav id="mobile-nav" className="px-5 pb-6 lg:hidden" aria-label="Menu">
          <ul className="flex flex-col">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="block py-3 text-lg text-ink"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className={buttonVariants({ variant: "secondary", size: "lg", className: "rounded-full" })}
            >
              Entrar
            </Link>
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className={buttonVariants({ size: "lg", className: "rounded-full" })}
            >
              Criar conta
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
