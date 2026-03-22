import { useEffect, useState } from "react"
import { SingleDecisionDialog } from "@/components/ui/single-decision-dialog"

interface CancelFlowConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  runStartedAt: number | null
  onConfirmCancel: () => void
}

function formatRunningMinutes(startedAt: number | null): string {
  if (!startedAt) return "several"
  const minutes = Math.floor((Date.now() - startedAt) / 60_000)
  return String(Math.max(1, minutes))
}

export function CancelFlowConfirmDialog({
  open,
  onOpenChange,
  runStartedAt,
  onConfirmCancel,
}: CancelFlowConfirmDialogProps) {
  const [displayMinutes, setDisplayMinutes] = useState(() => formatRunningMinutes(runStartedAt))

  useEffect(() => {
    if (!open) return
    setDisplayMinutes(formatRunningMinutes(runStartedAt))
  }, [open, runStartedAt])

  return (
    <SingleDecisionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel this flow?"
      description={(
        <>
          This flow has been running for {displayMinutes} minutes.
          {" "}Cancelling will stop all remaining steps but keep any partial results.
        </>
      )}
      confirmLabel="Cancel flow"
      cancelLabel="Keep running"
      onConfirm={onConfirmCancel}
      confirmVariant="destructive"
      size="sm"
      preventOutsideDismiss
    />
  )
}
