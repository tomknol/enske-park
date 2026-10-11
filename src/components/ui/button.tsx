import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-[transform,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--map-accent)]/35 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "rounded-[var(--map-radius-control)] bg-[var(--map-text)] px-5 py-2.5 text-white shadow-sm",
        secondary:
          "rounded-[var(--map-radius-control)] border border-[var(--map-border)] bg-[var(--map-surface)] px-4 py-2 text-[var(--map-text)] shadow-sm",
        ghost: "rounded-[var(--map-radius-control)] text-[var(--map-text-secondary)] hover:bg-black/5",
      },
      size: {
        default: "h-11 px-5",
        icon: "h-11 w-11 shrink-0 p-0",
        sm: "h-9 px-4 text-xs",
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
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
