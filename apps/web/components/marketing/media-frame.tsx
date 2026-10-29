import Image from "next/image";

import { cn } from "@/lib/utils";

type MediaFrameProps = {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  /** Overlay escuro para garantir contraste de texto sobre a foto */
  overlay?: "none" | "soft" | "strong" | "left" | "bottom";
  priority?: boolean;
  sizes?: string;
  /** Decorative when alt is empty and aria-hidden on parent */
  decorative?: boolean;
};

const OVERLAY: Record<NonNullable<MediaFrameProps["overlay"]>, string> = {
  none: "",
  soft: "bg-gradient-to-t from-canvas/80 via-canvas/35 to-canvas/20",
  strong: "bg-gradient-to-br from-canvas/92 via-canvas/65 to-canvas/45",
  left: "bg-gradient-to-r from-canvas via-canvas/75 to-transparent",
  bottom: "bg-gradient-to-t from-canvas via-canvas/70 to-transparent",
};

/**
 * Foto temática com overlay acessível (contraste WCAG sobre texto).
 */
export function MediaFrame({
  src,
  alt,
  className,
  imgClassName,
  overlay = "none",
  priority = false,
  sizes = "(max-width: 768px) 100vw, 50vw",
  decorative = false,
}: MediaFrameProps) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Image
        src={src}
        alt={decorative ? "" : alt}
        fill
        priority={priority}
        sizes={sizes}
        className={cn(
          "object-cover transition-transform duration-700 ease-out will-change-transform",
          "motion-safe:group-hover:scale-[1.03]",
          imgClassName,
        )}
        aria-hidden={decorative || undefined}
      />
      {overlay !== "none" ? (
        <div className={cn("pointer-events-none absolute inset-0", OVERLAY[overlay])} aria-hidden />
      ) : null}
      {/* Vinheta tech sutil — não conta como “badge” sobreposto */}
      <div
        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10"
        aria-hidden
      />
    </div>
  );
}
