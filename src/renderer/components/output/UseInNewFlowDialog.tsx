import type { WorkflowTemplate } from "@shared/types"
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
import { AutosizeTextarea } from "@/components/ui/autosize-textarea"
import { cn } from "@/lib/cn"

interface UseInNewFlowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectName: string | null
  sourceLabel: string
  suggestedTemplates: WorkflowTemplate[]
  selectedTemplateId: string | null
  onSelectTemplate: (templateId: string | null) => void
  intent: string
  onIntentChange: (value: string) => void
  loading: boolean
  pending: boolean
  onConfirm: () => void
}

export function UseInNewFlowDialog({
  open,
  onOpenChange,
  projectName,
  sourceLabel,
  suggestedTemplates,
  selectedTemplateId,
  onSelectTemplate,
  intent,
  onIntentChange,
  loading,
  pending,
  onConfirm,
}: UseInNewFlowDialogProps) {
  const selectedTemplate =
    suggestedTemplates.find((template) => template.id === selectedTemplateId) ||
    null
  const trimmedIntent = intent.trim()
  const canConfirm = Boolean(selectedTemplate || trimmedIntent)
  const primaryLabel = selectedTemplate
    ? `Start ${selectedTemplate.name}`
    : "Start with Agent"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent size="lg">
        <CanvasDialogHeader>
          <DialogTitle>Use this result in a new flow</DialogTitle>
          <DialogDescription>
            {projectName
              ? `Start the next flow in ${projectName} without losing this result.`
              : "Start the next flow without losing this result."}
          </DialogDescription>
        </CanvasDialogHeader>

        <CanvasDialogBody className="space-y-4">
          <div className="border-b border-hairline pb-3">
            <div className="ui-meta-label text-muted-foreground">
              Using result
            </div>
            <div className="mt-1 text-body-sm text-foreground">
              {sourceLabel}
            </div>
          </div>

          {loading ? (
            <div className="text-body-sm text-muted-foreground">
              Loading suggested starts…
            </div>
          ) : suggestedTemplates.length > 0 ? (
            <div className="space-y-2">
              <div className="ui-meta-label text-muted-foreground">
                Suggested starts
              </div>
              <div className="space-y-2">
                {suggestedTemplates.map((template) => {
                  const selected = selectedTemplateId === template.id
                  return (
                    <button
                      key={template.id}
                      type="button"
                      className={cn(
                        "w-full rounded-lg border border-hairline px-3 py-3 text-left ui-transition-colors ui-motion-fast",
                        selected
                          ? "bg-surface-2/75 text-foreground"
                          : "bg-transparent text-foreground hover:bg-surface-2/45",
                      )}
                      onClick={() =>
                        onSelectTemplate(selected ? null : template.id)
                      }
                    >
                      <div className="text-body-sm font-medium">
                        {template.name}
                      </div>
                      <div className="mt-1 text-body-sm text-muted-foreground">
                        {template.useWhen ||
                          template.output ||
                          template.description}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="ui-meta-label text-muted-foreground">
              Or describe the next flow
            </div>
            <AutosizeTextarea
              value={intent}
              onChange={(event) => onIntentChange(event.target.value)}
              rows={3}
              maxHeight={168}
              placeholder="Example: Use this audit to plan and execute the top fixes"
              className="w-full rounded-lg border border-input bg-input-background px-3 py-3 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20"
            />
          </div>
        </CanvasDialogBody>

        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            disabled={!canConfirm || pending}
            onClick={onConfirm}
          >
            {pending ? "Opening..." : primaryLabel}
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
