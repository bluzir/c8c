import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Cross2Icon } from "@radix-ui/react-icons"
import * as React from "react"

import { cn } from "@/lib/cn"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 ui-overlay-scrim",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean
    onOverlayClick?: () => void
  }
>(
  (
    { className, children, showCloseButton = true, onOverlayClick, ...props },
    ref,
  ) => (
    <DialogPortal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 ui-overlay-scrim",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        )}
        onClick={onOverlayClick}
      />
      <DialogPrimitive.Content
        ref={ref}
        data-canvas-dialog
        className={cn(
          "fixed left-[50%] top-[50%] z-50 mx-auto grid w-[600px] max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg surface-elevated overflow-hidden p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/10 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/10 data-[state=open]:slide-in-from-top-[48%]",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="ui-focus-managed absolute right-4 top-4 rounded-md border border-transparent p-1.5 text-muted-foreground ui-transition-colors ui-motion-fast hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/14">
            <Cross2Icon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
)
DialogContent.displayName = DialogPrimitive.Content.displayName

const CanvasDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean
    size?: "sm" | "md" | "lg" | "xl"
  }
>(
  (
    { className, children, showCloseButton = true, size = "md", ...props },
    ref,
  ) => {
    const sizeClass =
      size === "sm"
        ? "w-[360px] max-w-[calc(100%-2rem)]"
        : size === "lg"
          ? "w-[600px] max-w-[calc(100%-2rem)]"
          : size === "xl"
            ? "w-[min(100%-2rem,72rem)]"
            : "w-[420px] max-w-[calc(100%-2rem)]"

    return (
      <DialogPortal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 ui-overlay-scrim",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          ref={ref}
          data-canvas-dialog
          className={cn(
            "fixed left-[50%] top-[50%] z-50 max-h-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-lg surface-elevated overflow-hidden",
            sizeClass,
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/10 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/10 data-[state=open]:slide-in-from-top-[48%]",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close className="ui-focus-managed absolute right-3 top-3 h-control-sm w-control-sm rounded-md flex items-center justify-center text-muted-foreground ui-transition-colors ui-motion-fast hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/14">
              <Cross2Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    )
  },
)
CanvasDialogContent.displayName = "CanvasDialogContent"

const CanvasDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("ui-dialog-gutter py-4", className)} {...props} />
)
CanvasDialogHeader.displayName = "CanvasDialogHeader"

const CanvasDialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("ui-dialog-gutter pb-4", className)} {...props} />
)
CanvasDialogBody.displayName = "CanvasDialogBody"

const CanvasDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "ui-dialog-gutter bg-surface-2/80 py-3 flex flex-wrap items-center justify-end gap-2 border-t border-border",
      className,
    )}
    {...props}
  />
)
CanvasDialogFooter.displayName = "CanvasDialogFooter"

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-2 text-left", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex items-center justify-end gap-2", className)}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-title-md", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-body-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
