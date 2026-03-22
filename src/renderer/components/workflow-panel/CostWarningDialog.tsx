import { Button } from "@/components/ui/button"
import {
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PreflightWarning } from "@/features/execution/preflight"

interface CostWarningDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warning: PreflightWarning | null
  onConfirm: () => void
  onCancel: () => void
}

export function CostWarningDialog({
  open,
  onOpenChange,
  warning,
  onConfirm,
  onCancel,
}: CostWarningDialogProps) {
  if (!warning) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        showCloseButton={false}
        size="sm"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <CanvasDialogHeader className="surface-warning-soft">
          <DialogTitle>{warning.title}</DialogTitle>
          <DialogDescription>
            {warning.message}
          </DialogDescription>
        </CanvasDialogHeader>
        <div className="space-y-2 px-4 pb-3">
          <p className="text-body-sm text-foreground">
            Worst-case breakdown: {warning.detail}
          </p>
          <p className="ui-meta-text text-muted-foreground">
            Continue only if this spend is expected for the current run.
          </p>
        </div>
        <CanvasDialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            autoFocus
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
          >
            Continue anyway
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
