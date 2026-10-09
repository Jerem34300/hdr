import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { bindTap } from "@/components/hdar/tap";

const styles = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-transform duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
  {
    variants: {
      variant: {
        signal: "bg-signal text-night",
        surface: "border border-line bg-surface text-ink",
        ghost: "bg-transparent text-ink",
        spot: "bg-spot text-night",
        line: "border border-line bg-night text-ink",
      },
      size: {
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "signal", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  type = "button",
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles>) {
  return (
    <button
      type={type}
      className={cn(styles({ variant, size }), className)}
      {...props}
      {...bindTap(() => onClick?.(undefined as never))}
    />
  );
}
