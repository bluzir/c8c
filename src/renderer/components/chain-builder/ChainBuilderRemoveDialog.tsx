import { SingleDecisionDialog } from "@/components/ui/single-decision-dialog"

interface ChainBuilderRemoveDialogProps {
  open: boolean
  stepLabel: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ChainBuilderRemoveDialog({
  open,
  stepLabel,
  onOpenChange,
  onConfirm,
}: ChainBuilderRemoveDialogProps) {
  return (
    <SingleDecisionDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Remove step?"
      description="This removes the step and its connections from the current flow."
      body={
        <p className="text-body-sm text-foreground">
          Remove &ldquo;{stepLabel}&rdquo; from this flow?
        </p>
      }
      confirmLabel="Remove"
      onConfirm={onConfirm}
      confirmVariant="destructive"
    />
  )
}
