import { BrandLogo } from "@/components/brand/brand-logo";

type BrandLockupProps = {
  className?: string;
  href?: string | null;
  variant?: "full" | "compact" | "wordmark";
  showSlogan?: boolean;
  size?: "sm" | "md" | "lg";
};

/** Compat: delega para BrandLogo (sem moldura). */
export function BrandLockup({
  className,
  href = "/",
  variant = "full",
  showSlogan = false,
  size = "md",
}: BrandLockupProps) {
  if (variant === "wordmark") {
    return (
      <BrandLogo
        href={href}
        variant="light"
        size={size}
        showTagline={showSlogan}
        layout="horizontal"
        className={className}
      />
    );
  }

  return (
    <BrandLogo
      href={href}
      variant="light"
      size={size}
      showTagline={showSlogan}
      layout={variant === "compact" ? "mark" : "horizontal"}
      className={className}
    />
  );
}
