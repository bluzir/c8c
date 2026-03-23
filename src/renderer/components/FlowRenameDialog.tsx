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
import { Input } from "@/components/ui/input"

interface FlowRenameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onValueChange: (value: string) => void
  onCommit: () => void
}

export function FlowRenameDialog({
  open,
  onOpenChange,
  value,
  onValueChange,
  onCommit,
}: FlowRenameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent showCloseButton={false}>
        <CanvasDialogHeader>
          <DialogTitle>Rename flow</DialogTitle>
          <DialogDescription>Enter a new name for this flow.</DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogBody>
          <Input
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onCommit()}
            autoFocus
          />
        </CanvasDialogBody>
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={onCommit}>
            Rename
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
