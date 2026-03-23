import { ChainBuilder } from "@/components/ChainBuilder"
import {
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogHeader,
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

interface WorkflowGraphDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WorkflowGraphDialog({
  open,
  onOpenChange,
}: WorkflowGraphDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent
        size="xl"
        className="max-h-[80vh] flex flex-col p-0 gap-0"
      >
        <CanvasDialogHeader className="surface-depth-header">
          <DialogTitle>Edit flow graph</DialogTitle>
          <DialogDescription>
            Advanced: add, remove, reorder, and inspect the steps in this flow.
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="flex-1 min-h-0 overflow-y-auto pt-4 surface-panel">
          <ChainBuilder mode="edit" />
        </CanvasDialogBody>
      </CanvasDialogContent>
    </Dialog>
  )
}
