import { SingleDecisionDialog } from "@/components/ui/single-decision-dialog"

interface SidebarConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  confirmVariant?: "destructive" | "default"
  note?: string
}

export function SidebarConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmVariant = "default",
  note,
}: SidebarConfirmDialogProps) {
  return (
    <SingleDecisionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      note={note}
      noteTone={confirmVariant === "destructive" ? "danger" : "muted"}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      confirmVariant={confirmVariant}
      preventOutsideDismiss={confirmVariant === "destructive"}
    />
  )
}
