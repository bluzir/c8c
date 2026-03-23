import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/cn"

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, ...props }, ref) => (
    <label
      className={cn(
        "relative inline-flex h-control-xs w-control-xs cursor-pointer items-center justify-center",
        props.disabled && "cursor-not-allowed",
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        className={cn("peer sr-only", className)}
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-full w-full items-center justify-center rounded-sm border border-input bg-input-background text-foreground ui-transition-colors ui-motion-fast hover:border-hairline hover:bg-surface-1",
          "peer-focus-visible:outline-none peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/14",
          "peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground",
          "peer-checked:[&_svg]:opacity-100",
          props["aria-invalid"] && "border-status-danger text-status-danger",
          "peer-disabled:border-hairline peer-disabled:bg-surface-2/80 peer-disabled:text-disabled",
        )}
      >
        <Check
          size={12}
          className="opacity-0 ui-transition-opacity ui-motion-fast"
        />
      </span>
    </label>
  ),
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
