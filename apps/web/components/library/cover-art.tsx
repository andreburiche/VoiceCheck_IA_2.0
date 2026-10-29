import { cn } from "@/lib/utils";

type CoverArtProps = {
  /** Id estável (mantido por compatibilidade). */
  seed: string;
  /** Nome da música: vira o monograma da capa. */
  title?: string | null;
  className?: string;
  /** Mantido por compatibilidade: a capa agora é sempre um quadrado. */
  compact?: boolean;
};

/** Duas iniciais legíveis a partir do nome ("Jelly Roll Ft…" → "JR"). */
export function initialsOf(title?: string | null): string {
  const words = (title ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "♪";
  const first = words[0]!;
  const second = words.find((w, i) => i > 0 && /\p{L}/u.test(w[0] ?? ""));
  return ((first[0] ?? "") + (second?.[0] ?? first[1] ?? "")).toUpperCase();
}

/**
 * Capa da música: monograma sobre superfície neutra.
 * (Substitui as formas de onda geradas aleatoriamente — dado falso num produto de medição.)
 */
export function CoverArt({ seed, title, className }: CoverArtProps) {
  const label = initialsOf(title ?? seed);
  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-lg border border-line/70 bg-canvas-overlay font-display text-sm font-semibold tracking-tight text-accent",
        className,
      )}
      aria-hidden
    >
      {label}
    </div>
  );
}
