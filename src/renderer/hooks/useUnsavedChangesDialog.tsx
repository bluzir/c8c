import { useCallback, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

export function useUnsavedChangesDialog() {
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const resolveDialog = useCallback((value: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setPendingAction(null)
    resolve?.(value)
  }, [])

  const confirmDiscard = useCallback((action: string, isDirty: boolean) => {
    if (!isDirty) return Promise.resolve(true)

    if (resolverRef.current) {
      resolverRef.current(false)
      resolverRef.current = null
    }

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setPendingAction(action)
    })
  }, [])

  const unsavedChangesDialog = (
    <Dialog
      open={pendingAction !== null}
      onOpenChange={(open) => !open && resolveDialog(false)}
    >
      <CanvasDialogContent showCloseButton={false}>
        <CanvasDialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>
            {`You have unsaved changes. Discard them and ${pendingAction || "continue"}?`}
          </DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => resolveDialog(false)}
          >
            Keep editing
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => resolveDialog(true)}
          >
            Discard changes
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )

  return {
    confirmDiscard,
    unsavedChangesDialog,
  }
}
