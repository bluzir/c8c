/**
 * Shared styles for overlay components (Popover, Dropdown, Select, ContextMenu)
 */

// Container Styles
export const overlayContentBase =
  "z-50 overflow-hidden rounded-lg border border-border bg-popover text-body-sm text-popover-foreground"

export const overlayMaxHeight = "max-h-[calc(100vh-32px)]"

export const overlayAnimation =
  "data-[state=open]:animate-in data-[state=closed]:animate-out [animation-duration:var(--motion-fast)] data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"

export const overlaySlideIn =
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"

export const overlayContent = `${overlayContentBase} ${overlayMaxHeight} ${overlayAnimation} ${overlaySlideIn}`

// Item Styles
export const overlayItemBase =
  "relative flex min-h-control-sm cursor-default select-none items-center gap-2 rounded-md px-2 py-1 mx-1 text-body-sm outline-none"

export const overlayItemHover = "hover:bg-accent hover:text-accent-foreground"

export const overlayItemFocus = "focus:bg-accent focus:text-accent-foreground"

export const overlayItemHighlighted =
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"

export const overlayItemDisabled =
  "data-[disabled]:pointer-events-none data-[disabled]:text-muted-foreground/80"

export const overlayItemTransition = "ui-transition-colors ui-motion-fast"

export const overlayItem = `${overlayItemBase} ${overlayItemHover} ${overlayItemFocus} ${overlayItemHighlighted} ${overlayItemDisabled} ${overlayItemTransition}`

export const overlayItemIndicator =
  "absolute left-2 flex h-3.5 w-3.5 items-center justify-center"

export const overlaySeparator = "my-1 h-px bg-border mx-1"

export const overlayLabel = "mx-1 px-2 py-1 ui-meta-label"
