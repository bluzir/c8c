import * as React from "react"

import { cn } from "@/lib/cn"

export interface SliderProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      className={cn(
        "ui-focus-managed ui-slider h-control-xs w-full cursor-pointer ui-motion-fast",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/14",
        "disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  ),
)
Slider.displayName = "Slider"

export { Slider }
