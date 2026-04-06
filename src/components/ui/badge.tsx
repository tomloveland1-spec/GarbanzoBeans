import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        // Dark Forest default — lime tinted bg with lime text
        default:
          "border-[#C0F500]/30 bg-[rgba(192,245,0,0.13)] text-[#C0F500]",
        // Envelope state variants
        "envelope-green":
          "border-[#C0F500]/30 bg-[rgba(192,245,0,0.13)] text-[#C0F500]",
        "envelope-orange":
          "border-[#F5A800]/30 bg-[rgba(245,168,0,0.13)] text-[#F5A800]",
        "envelope-red":
          "border-[#ff5555]/30 bg-[rgba(255,85,85,0.13)] text-[#ff5555]",
        destructive:
          "border-[#ff5555]/30 bg-[rgba(255,85,85,0.13)] text-[#ff5555]",
        outline: "border-[#26282C] text-[#EEEEF0]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
