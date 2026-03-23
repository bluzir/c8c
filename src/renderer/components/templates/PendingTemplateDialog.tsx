import { Button } from "@/components/ui/button"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PendingTemplateDetails } from "@/components/create/TemplateSuggestionCard"
import type { CreateRoutingPreview } from "@/lib/create-routing-preview"
import { getWorkflowTemplateDisplayName } from "@/lib/template-display"
import { deriveTemplateJobLabel } from "@/lib/workflow-entry"
import type { WorkflowTemplate } from "@/lib/store"

export function PendingTemplateDialog({
  pendingTemplate,
  routingPreview,
  executionSummary,
  projects,
  targetProjectPath,
  onTargetProjectPathChange,
  blockerStatement,
  actionInstruction,
  pendingTemplateDecision,
  onPendingTemplateDecisionChange,
  replaceOptionAvailable,
  canContinue,
  onClose,
  onContinue,
}: {
  pendingTemplate: WorkflowTemplate | null
  routingPreview?: Pick<
    CreateRoutingPreview,
    "helpModeLabel" | "stageLabel" | "stages"
  > | null
  executionSummary?: string | null
  projects: string[]
  targetProjectPath: string | null
  onTargetProjectPathChange: (value: string) => void
  blockerStatement: string
  actionInstruction: string
  pendingTemplateDecision: "create" | "replace"
  onPendingTemplateDecisionChange: (value: "create" | "replace") => void
  replaceOptionAvailable: boolean
  canContinue: boolean
  onClose: () => void
  onContinue: () => void
}) {
  return (
    <Dialog
      open={pendingTemplate !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <CanvasDialogContent showCloseButton={false} size="lg">
        <CanvasDialogHeader>
          <DialogTitle>
            {pendingTemplate
              ? `Start ${
                  deriveTemplateJobLabel(pendingTemplate) ||
                  getWorkflowTemplateDisplayName(pendingTemplate)
                }`
              : "Start this starting point"}
          </DialogTitle>
          <DialogDescription>
            &ldquo;
            {pendingTemplate
              ? getWorkflowTemplateDisplayName(pendingTemplate)
              : ""}
            &rdquo; is ready. Choose how to apply it, then continue.
          </DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogBody className="space-y-4">
          {projects.length > 0 ? (
            <div className="space-y-1">
              <p className="ui-meta-text text-muted-foreground">
                Selected project
              </p>
              <Select
                value={targetProjectPath ?? ""}
                onValueChange={onTargetProjectPathChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((projectPath) => {
                    const projectName =
                      projectPath.split(/[\\/]/).pop() || projectPath
                    return (
                      <SelectItem key={projectPath} value={projectPath}>
                        {projectName}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              {blockerStatement} {actionInstruction}
            </p>
          )}
          <PendingTemplateDetails
            intentLabel={routingPreview?.helpModeLabel || null}
            startStageLabel={routingPreview?.stageLabel || null}
            executionSummary={executionSummary || null}
            processStages={routingPreview?.stages || null}
          />
          <div role="radiogroup" aria-label="Start mode" className="space-y-2">
            {projects.length > 0 ? (
              <button
                type="button"
                role="radio"
                aria-checked={pendingTemplateDecision === "create"}
                onClick={() => onPendingTemplateDecisionChange("create")}
                className={`w-full rounded-lg border px-3 py-3 text-left ui-transition-colors ui-motion-fast ${
                  pendingTemplateDecision === "create"
                    ? "border-transparent bg-surface-2/75"
                    : "border-hairline/70 hover:bg-surface-2/45"
                }`}
              >
                <p className="text-body-sm font-medium text-foreground">
                  Create in selected project
                </p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Make a new flow in{" "}
                  {targetProjectPath
                    ? targetProjectPath.split(/[\\/]/).pop() ||
                      "the selected project"
                    : "the selected project"}
                  .
                </p>
              </button>
            ) : null}
            {replaceOptionAvailable ? (
              <button
                type="button"
                role="radio"
                aria-checked={pendingTemplateDecision === "replace"}
                onClick={() => onPendingTemplateDecisionChange("replace")}
                className={`w-full rounded-lg border px-3 py-3 text-left ui-transition-colors ui-motion-fast ${
                  pendingTemplateDecision === "replace"
                    ? "border-transparent bg-surface-2/75"
                    : "border-hairline/70 hover:bg-surface-2/45"
                }`}
              >
                <p className="text-body-sm font-medium text-foreground">
                  Replace current draft
                </p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  Swap the current draft for this starting point.
                </p>
              </button>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                Current draft cannot be replaced while a run is active.
              </p>
            )}
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
            disabled={!pendingTemplate || !canContinue}
            onClick={onContinue}
          >
            Continue
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
