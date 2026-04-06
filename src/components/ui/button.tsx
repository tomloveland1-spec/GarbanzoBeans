import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base — remove shadcn's default ring; we set focus via global CSS
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        // PRIMARY — lime bg, dark text
        default:
          "bg-[#C0F500] text-[#111214] font-semibold shadow-sm hover:bg-[#C0F500]/90 active:bg-[#C0F500]/80",
        // SECONDARY — lime outline, lime text
        outline:
          "border border-[#C0F500] text-[#C0F500] bg-transparent hover:bg-[#C0F500]/10",
        // GHOST — no border, muted text
        ghost:
          "text-[rgba(255,255,255,0.65)] bg-transparent hover:bg-[rgba(255,255,255,0.07)] hover:text-[#EEEEF0]",
        // DESTRUCTIVE — red outline (NOT red bg)
        destructive:
          "border border-[#ff5555] text-[#ff5555] bg-transparent hover:bg-[#ff5555]/10",
        // Keep secondary/link as aliases if needed by shadcn internals
        secondary:
          "bg-[#1C1E21] text-[#EEEEF0] border border-[#26282C] hover:bg-[#26282C]",
        link:
          "text-[#C0F500] underline-offset-4 hover:underline bg-transparent",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
