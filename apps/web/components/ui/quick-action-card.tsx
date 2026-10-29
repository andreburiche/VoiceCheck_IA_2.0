import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type QuickActionCardProps = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: "accent" | "violet" | "flare";
  /** Mantido por compatibilidade; o cartão técnico não usa foto de fundo. */
  mediaSrc?: string;
};

const toneClass = {
  accent: "bg-accent/10 text-accent ring-accent/20",
  violet: "bg-violet/10 text-violet ring-violet/20",
  flare: "bg-flare/10 text-flare ring-flare/25",
};

/** Atalho compacto: ícone, título, descrição e seta. */
export function QuickActionCard({ href, title, description, icon: Icon, tone = "accent" }: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "panel-glass group flex items-center gap-4 rounded-xl p-4 transition-colors duration-200",
        "hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
      )}
    >
      <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1", toneClass[tone])}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-ink-muted">{description}</span>
      </span>
      <ArrowUpRight
        className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  );
}
