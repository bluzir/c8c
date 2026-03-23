import * as React from "react"

import { cn } from "@/lib/cn"

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { className, checked, disabled, onCheckedChange, onClick, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      className={cn(
        "ui-focus-managed relative inline-flex h-control-xs w-control-md shrink-0 items-center rounded-full border border-hairline/70 ui-transition-colors ui-motion-standard hover:border-hairline hover:bg-surface-3/70",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/14",
        "data-[state=checked]:border-primary/40 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted",
        "disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-2/80 disabled:[&_span]:bg-surface-1 disabled:[&_span]:opacity-70",
        className,
      )}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || disabled) return
        onCheckedChange?.(!checked)
      }}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform ui-motion-standard",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  ),
)
Switch.displayName = "Switch"

export { Switch }
