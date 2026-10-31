import Image from "next/image";
import Link from "next/link";

import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  href?: string | null;
  /** light = tema escuro (PNG transparente); dark = PNG com fundo preto */
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  layout?: "horizontal" | "mark";
};

/** Alturas de exibição — largura deriva da proporção real do asset. */
/** Alturas da arte (asset recortado, sem margem transparente). */
const HEIGHT = {
  sm: 36,
  md: 46,
  lg: 54,
  xl: 72,
} as const;

const MARK_BOX = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-14 w-14",
  xl: "h-16 w-16",
} as const;

/**
 * Logomarca VoiceCheck IA — mesmo asset e proporção em Home/Login/Footer.
 */
export function BrandLogo({
  className,
  href = "/",
  variant = "light",
  size = "md",
  showTagline = false,
  layout = "horizontal",
}: BrandLogoProps) {
  const maxH = HEIGHT[size];
  const lockupSrc = variant === "dark" ? BRAND.logoSrcDark : BRAND.logoSrc;

  const mark = (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden",
        MARK_BOX[size],
      )}
      aria-hidden
    >
      <Image
        src={BRAND.markSrc}
        alt=""
        width={128}
        height={128}
        className="h-full w-full object-contain"
        priority={size !== "sm"}
        quality={95}
      />
    </span>
  );

  const lockup = (
    <span className={cn("inline-flex min-w-0 max-w-full flex-col items-start gap-1", className)}>
      {layout === "mark" ? (
        mark
      ) : (
        <>
          <Image
            src={lockupSrc}
            alt={`${BRAND.name}${showTagline ? "" : ` — ${BRAND.slogan}`}`}
            width={BRAND.logoWidth}
            height={BRAND.logoHeight}
            className={cn("h-auto w-auto max-w-full object-contain object-left", variant === "light" && "so-escuro")}
            style={{ maxHeight: maxH, width: "auto", height: "auto" }}
            sizes={`(max-width: 640px) ${Math.round(maxH * (BRAND.logoWidth / BRAND.logoHeight))}px, ${Math.round(maxH * (BRAND.logoWidth / BRAND.logoHeight))}px`}
            priority
            quality={95}
          />
          {variant === "light" ? (
            // Tema claro: letras em grafite (a arte branca some no fundo claro).
            <Image
              src={BRAND.logoSrcPapel}
              alt={`${BRAND.name}${showTagline ? "" : ` — ${BRAND.slogan}`}`}
              width={BRAND.logoWidth}
              height={BRAND.logoHeight}
              className="so-claro h-auto w-auto max-w-full object-contain object-left"
              style={{ maxHeight: maxH, width: "auto", height: "auto" }}
              sizes={`${Math.round(maxH * (BRAND.logoWidth / BRAND.logoHeight))}px`}
              quality={95}
            />
          ) : null}
        </>
      )}
      {showTagline ? (
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-ink-muted">
          {BRAND.slogan}
        </span>
      ) : null}
    </span>
  );

  if (!href) return lockup;

  return (
    <Link
      href={href}
      className="inline-flex min-w-0 max-w-full items-center transition-opacity duration-ui hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      aria-label={`${BRAND.name} — página inicial`}
    >
      {lockup}
    </Link>
  );
}
