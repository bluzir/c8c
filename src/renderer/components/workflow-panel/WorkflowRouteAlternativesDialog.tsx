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

export interface WorkflowRouteAlternativeOption {
  templateId: string
  title: string
  helpModeLabel?: string | null
  stageLabel?: string | null
}

export function WorkflowRouteAlternativesDialog({
  open,
  options,
  pendingTemplateId,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  options: WorkflowRouteAlternativeOption[]
  pendingTemplateId?: string | null
  onOpenChange: (open: boolean) => void
  onSelect: (templateId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent showCloseButton={false} size="md">
        <CanvasDialogHeader>
          <DialogTitle>Other starts</DialogTitle>
          <DialogDescription>
            Pick a different first flow for this request.
          </DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogBody className="space-y-2">
          {options.map((option) => {
            const metaText = [
              option.helpModeLabel?.trim() || null,
              option.stageLabel?.trim()
                ? `Starting point: ${option.stageLabel.trim()}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")

            return (
              <Button
                key={option.templateId}
                type="button"
                variant="outline"
                size="sm"
                disabled={pendingTemplateId === option.templateId}
                onClick={() => {
                  void window.api
                    .trackUiEvent("routing_alternative_selected")
                    .catch(() => undefined)
                  onSelect(option.templateId)
                }}
                className="h-auto w-full justify-start rounded-lg px-3 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-body-sm font-medium text-foreground">
                    {option.title}
                  </span>
                  {metaText ? (
                    <span className="mt-0.5 block text-sidebar-meta text-muted-foreground">
                      {metaText}
                    </span>
                  ) : null}
                </span>
              </Button>
            )
          })}
        </CanvasDialogBody>
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Close
            </Button>
          </DialogClose>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
