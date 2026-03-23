import { cn } from "@/lib/cn"
import * as React from "react"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-control-md w-full rounded-md border border-input bg-input-background px-3 py-2 text-body-sm text-foreground transition-[border-color,background-color,color] ui-motion-fast placeholder:text-muted-foreground/80 hover:border-hairline hover:bg-surface-1 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 read-only:cursor-default read-only:border-hairline read-only:bg-surface-1/80 read-only:text-muted-foreground aria-invalid:border-status-danger aria-invalid:ring-[3px] aria-invalid:ring-status-danger/20 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-2/80 disabled:text-disabled disabled:opacity-100 disabled:[-webkit-text-fill-color:currentColor]",
          type === "search" &&
            "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
          type === "file" &&
            "p-0 pr-3 italic text-muted-foreground/70 file:me-3 file:h-full file:border-0 file:border-r file:border-solid file:border-input file:bg-transparent file:px-3 file:text-body-sm file:font-medium file:not-italic file:text-foreground",
          type === "number" &&
            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input }
