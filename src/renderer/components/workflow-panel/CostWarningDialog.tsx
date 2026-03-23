import { Button } from "@/components/ui/button"
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

  const estimatedCostLabel = `~$${warning.estimatedCostUsd.toFixed(2)}`
  const invocationLabel = `${warning.worstCaseInvocations} skill invocation${warning.worstCaseInvocations === 1 ? "" : "s"}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        showCloseButton={false}
        size="lg"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          onCancel()
        }}
      >
        <CanvasDialogHeader className="space-y-1.5">
          <DialogTitle>{warning.title}</DialogTitle>
          <DialogDescription>
            Review the worst-case estimate before you start this run.
          </DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogBody className="space-y-4">
          <div className="ui-inset-well">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="ui-meta-label text-status-warning">
                  Worst-case estimate
                </div>
                <p className="text-title-sm text-foreground">
                  {estimatedCostLabel}
                </p>
              </div>
              <div className="space-y-1 sm:text-right">
                <div className="ui-meta-label text-muted-foreground">
                  Skill invocations
                </div>
                <p className="text-body-md font-medium text-foreground">
                  {invocationLabel}
                </p>
              </div>
            </div>
            <p className="mt-3 text-body-sm text-muted-foreground">
              Continue only if this spend is expected for the current run.
            </p>
          </div>
          <div className="space-y-1">
            <div className="ui-meta-label text-muted-foreground">
              Worst-case breakdown
            </div>
            <p className="text-body-sm leading-6 text-foreground break-words">
              {warning.detail}
            </p>
          </div>
        </CanvasDialogBody>
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm" autoFocus>
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={onConfirm}>
            Continue
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
