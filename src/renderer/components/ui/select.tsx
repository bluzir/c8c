import * as SelectPrimitive from "@radix-ui/react-select"
import * as React from "react"

import { cn } from "@/lib/cn"
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@radix-ui/react-icons"
import {
  overlayContentBase,
  overlayMaxHeight,
  overlayAnimation,
  overlaySlideIn,
  overlayItemBase,
  overlayItemHover,
  overlayItemFocus,
  overlayItemHighlighted,
  overlayItemDisabled,
  overlayItemTransition,
  overlayItemIndicator,
  overlayLabel,
  overlaySeparator,
} from "@/lib/overlay-styles"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Value>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Value
    ref={ref}
    className={cn("block min-w-0 truncate", className)}
    {...props}
  />
))
SelectValue.displayName = SelectPrimitive.Value.displayName

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-control-md w-full min-w-0 items-center justify-between gap-2 overflow-hidden whitespace-nowrap rounded-md border border-input bg-input-background px-3 py-1 text-start text-body-sm text-foreground transition-[border-color,background-color,color] ui-motion-fast hover:border-hairline hover:bg-surface-1 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/40 aria-invalid:border-status-danger aria-invalid:ring-[3px] aria-invalid:ring-status-danger/20 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-2/80 disabled:text-disabled disabled:opacity-100 disabled:[-webkit-text-fill-color:currentColor] data-[placeholder]:text-muted-foreground/80 [&>span]:block [&>span]:min-w-0 [&>span]:truncate",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon
        width={16}
        height={16}
        className="shrink-0 text-muted-foreground/80"
      />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "absolute top-0 left-0 right-0 z-10 flex cursor-default items-center justify-center h-6 bg-gradient-to-b from-popover via-popover/80 to-transparent animate-in fade-in-0 ui-motion-fast",
      className,
    )}
    {...props}
  >
    <ChevronUpIcon
      width={16}
      height={16}
      className="shrink-0 text-muted-foreground/80"
    />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "absolute bottom-0 left-0 right-0 z-10 flex cursor-default items-center justify-center h-6 bg-gradient-to-t from-popover via-popover/80 to-transparent animate-in fade-in-0 ui-motion-fast",
      className,
    )}
    {...props}
  >
    <ChevronDownIcon
      width={16}
      height={16}
      className="shrink-0 text-muted-foreground/80"
    />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        overlayContentBase,
        overlayMaxHeight,
        overlayAnimation,
        overlaySlideIn,
        "relative",
        position === "popper" &&
          "w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn("w-full py-1 max-h-[inherit] overflow-y-auto")}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(overlayLabel, className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      overlayItemBase,
      overlayItemHover,
      overlayItemFocus,
      overlayItemHighlighted,
      overlayItemDisabled,
      overlayItemTransition,
      "pl-7 pr-2 items-center",
      className,
    )}
    {...props}
  >
    <span className={overlayItemIndicator}>
      <SelectPrimitive.ItemIndicator>
        <CheckIcon
          width={16}
          height={16}
          className="shrink-0 text-muted-foreground/80"
        />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText className="block min-w-0 truncate">
      {children}
    </SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn(overlaySeparator, className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
