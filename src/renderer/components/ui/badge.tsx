import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/cn"

const badgeVariants = cva(
  "ui-focus-managed inline-flex w-fit max-w-full shrink-0 items-center justify-center overflow-hidden text-ellipsis border align-middle whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/14 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary/80 bg-primary text-primary-foreground",
        secondary: "border-border bg-surface-2 text-secondary-foreground",
        destructive: "border-destructive/70 bg-destructive/10 text-destructive",
        outline: "border-border bg-surface-1/70 text-foreground",
        success:
          "border-status-success/30 bg-status-success/10 text-status-success",
        warning:
          "border-status-warning/30 bg-status-warning/10 text-status-warning",
        info: "border-status-info/30 bg-status-info/10 text-status-info",
      },
      size: {
        default: "gap-1 rounded-md px-2 py-0 text-label-xs",
        compact: "gap-0.5 rounded-md px-1.5 py-0 text-label-xs",
        pill: "gap-1 rounded-full px-2.5 py-0.5 text-label-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
