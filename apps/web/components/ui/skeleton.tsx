import { cn } from "@/lib/utils";

/** Bloco de carregamento no formato do conteúdo final (evita "pulo" de layout). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-white/[0.045] motion-reduce:animate-none", className)} aria-hidden />;
}

/** Esqueleto de página: título + bloco principal + linha de cartões. */
export function PageSkeleton({ label = "Carregando…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("page-shell space-y-6", className)} aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-4 w-96 max-w-full rounded-md" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="hidden h-32 rounded-2xl xl:block" />
      </div>
    </div>
  );
}

/** Esqueleto de lista/grade de cartões. */
export function CardGridSkeleton({ count = 3, label = "Carregando…" }: { count?: number; label?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-44 rounded-2xl" />
      ))}
    </div>
  );
}
