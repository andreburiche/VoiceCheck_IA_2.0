import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/** Exportado para estilizar <Link> como botão (sem aninhar <button> dentro de <a>). */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-accent text-canvas hover:bg-accent-soft active:bg-accent-deep",
        secondary:
          "bg-canvas-overlay/90 text-ink border border-line/80 hover:border-ink-faint/50 hover:bg-canvas-card",
        /** Ação de destaque secundária (tonal): mesma família do accent, sem brilho. */
        violet: "border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20",
        ghost: "text-ink-muted hover:text-ink hover:bg-canvas-overlay/80",
        danger: "bg-signal-err/90 text-white hover:bg-signal-err",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  ),
);
Button.displayName = "Button";
