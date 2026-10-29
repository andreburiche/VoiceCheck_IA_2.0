import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export function EmptyState({ icon: Icon, title, description, actionHref, actionLabel }: EmptyStateProps) {
  return (
    <div className="panel-glass relative flex flex-col items-center overflow-hidden rounded-2xl px-6 py-14 text-center">
      <span className="relative mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="relative font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="relative mt-2 max-w-md text-sm text-ink-muted">{description}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className={buttonVariants({ className: "relative mt-6 rounded-lg" })}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
