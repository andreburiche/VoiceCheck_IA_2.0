import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  markOnly?: boolean;
};

/** Emblema isolado para rail / favicon visual. */
export function LogoMark({ className, size = "md" }: LogoMarkProps) {
  return (
    <BrandLogo
      href={null}
      variant="light"
      size={size}
      layout="mark"
      className={cn(className)}
    />
  );
}
