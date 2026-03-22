import type { ReactNode } from "react"
import { Button, type ButtonProps } from "@/components/ui/button"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/cn"

interface SingleDecisionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  note?: ReactNode
  noteTone?: "danger" | "warning" | "muted"
  body?: ReactNode
  confirmLabel: ReactNode
  onConfirm: () => void
  confirmVariant?: NonNullable<ButtonProps["variant"]>
  confirmDisabled?: boolean
  cancelLabel?: ReactNode
  size?: "sm" | "md" | "lg" | "xl"
  preventOutsideDismiss?: boolean
}

const NOTE_TONE_CLASS: Record<NonNullable<SingleDecisionDialogProps["noteTone"]>, string> = {
  danger: "text-status-danger",
  warning: "text-status-warning",
  muted: "text-muted-foreground",
}

export function SingleDecisionDialog({
  open,
  onOpenChange,
  title,
  description,
  note,
  noteTone = "muted",
  body,
  confirmLabel,
  onConfirm,
  confirmVariant = "default",
  confirmDisabled = false,
  cancelLabel = "Cancel",
  size = "md",
  preventOutsideDismiss = false,
}: SingleDecisionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        showCloseButton={false}
        size={size}
        onInteractOutside={(event) => {
          if (preventOutsideDismiss) {
            event.preventDefault()
          }
        }}
      >
        <CanvasDialogHeader className="space-y-1.5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {note ? (
            <p className={cn("ui-meta-text", NOTE_TONE_CLASS[noteTone])}>
              {note}
            </p>
          ) : null}
        </CanvasDialogHeader>
        {body ? (
          <CanvasDialogBody className="space-y-3">
            {body}
          </CanvasDialogBody>
        ) : null}
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm" autoFocus>{cancelLabel}</Button>
          </DialogClose>
          <Button
            variant={confirmVariant}
            size="sm"
            disabled={confirmDisabled}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
