import * as React from "react"

import { cn } from "@/lib/cn"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-input-background px-3 py-2 text-body-sm text-foreground transition-[border-color,background-color,color] ui-motion-fast placeholder:text-muted-foreground/80 hover:border-hairline hover:bg-surface-1 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 read-only:cursor-default read-only:border-hairline read-only:bg-surface-1/80 read-only:text-muted-foreground aria-invalid:border-status-danger aria-invalid:ring-[3px] aria-invalid:ring-status-danger/20 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-2/80 disabled:text-disabled disabled:opacity-100 disabled:[-webkit-text-fill-color:currentColor]",
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
