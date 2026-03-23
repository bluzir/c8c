import { FolderPlus, Loader2 } from "lucide-react"
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
import type {
  CreateEntryHelpModeHint,
  CreateEntryRouteClarification,
  WorkflowTemplate,
} from "@shared/types"
import type { ProcessSpineStage } from "@/lib/process-spine"
import { PendingTemplateDetails } from "@/components/create/TemplateSuggestionCard"
import { deriveTemplateJobLabel } from "@/lib/workflow-entry"

export type RouteClarificationSelection =
  | { kind: "help_mode"; helpMode: CreateEntryHelpModeHint }
  | { kind: "job_route"; templateId: string }

interface JobRouteMeta {
  helpModeLabel?: string | null
  stageLabel?: string | null
}

export function RouteClarificationDialog({
  clarification,
  jobRouteMetaByTemplateId,
  onClose,
  onSelect,
}: {
  clarification: CreateEntryRouteClarification | null
  jobRouteMetaByTemplateId?: Record<string, JobRouteMeta | undefined>
  onClose: () => void
  onSelect: (selection: RouteClarificationSelection) => void
}) {
  return (
    <Dialog
      open={clarification !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <CanvasDialogContent showCloseButton={false} size="md">
        <CanvasDialogHeader>
          <DialogTitle>{clarification?.title}</DialogTitle>
          <DialogDescription>{clarification?.message}</DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogBody className="space-y-2">
          {clarification?.kind === "job_route"
            ? clarification.options.map((option) => {
                const meta = jobRouteMetaByTemplateId?.[option.templateId]
                const metaText = [meta?.helpModeLabel, meta?.stageLabel]
                  .filter(Boolean)
                  .join(" · ")

                return (
                  <Button
                    key={option.templateId}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onSelect({
                        kind: "job_route",
                        templateId: option.templateId,
                      })
                    }
                    className="h-auto w-full justify-start rounded-lg px-3 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-body-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      {metaText ? (
                        <span className="mt-0.5 block text-sidebar-meta text-muted-foreground">
                          {metaText}
                        </span>
                      ) : null}
                      {option.description ? (
                        <span className="mt-0.5 block text-sidebar-meta text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </Button>
                )
              })
            : clarification?.options.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={option.disabled}
                  onClick={() =>
                    onSelect({ kind: "help_mode", helpMode: option.value })
                  }
                  className="h-auto w-full justify-start rounded-lg px-3 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-body-sm font-medium text-foreground">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="mt-0.5 block text-sidebar-meta text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </Button>
              ))}
        </CanvasDialogBody>
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}

export function WorkflowCreatePendingTemplateDialog({
  pendingTemplate,
  pendingQuickStartLabel,
  targetProjectPath,
  targetProjectName,
  pendingTemplateIntentLabel,
  pendingTemplateStartStageLabel,
  pendingTemplateExecutionSummary,
  pendingTemplateProcessStages,
  openingProject,
  templateAction,
  pendingPrimaryActionLabel,
  onClose,
  onOpenProject,
  onCustomize,
  onCreate,
}: {
  pendingTemplate: WorkflowTemplate | null
  pendingQuickStartLabel: string | null
  targetProjectPath: string | null
  targetProjectName: string | null
  pendingTemplateIntentLabel: string | null
  pendingTemplateStartStageLabel: string | null
  pendingTemplateExecutionSummary: string | null
  pendingTemplateProcessStages?: ProcessSpineStage[] | null
  openingProject: boolean
  templateAction: "create" | "customize" | null
  pendingPrimaryActionLabel: string
  onClose: () => void
  onOpenProject: () => void
  onCustomize: (template: WorkflowTemplate) => void
  onCreate: (template: WorkflowTemplate) => void
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
                  pendingQuickStartLabel ||
                  deriveTemplateJobLabel(pendingTemplate) ||
                  pendingTemplate.name
                }`
              : "Start this starting point"}
          </DialogTitle>
          <DialogDescription>
            Choose how to open this starting point in your project.
          </DialogDescription>
        </CanvasDialogHeader>
        <CanvasDialogBody className="space-y-4">
          {targetProjectPath ? (
            <div className="space-y-1">
              <p className="ui-meta-text text-muted-foreground">
                Selected project
              </p>
              <p className="mt-1 text-body-md font-medium text-foreground">
                {targetProjectName}
              </p>
            </div>
          ) : (
            <div className="text-body-sm text-muted-foreground">
              Select or add a project first so this flow has somewhere to start.
            </div>
          )}
          <PendingTemplateDetails
            intentLabel={pendingTemplateIntentLabel}
            startStageLabel={pendingTemplateStartStageLabel}
            executionSummary={pendingTemplateExecutionSummary}
            processStages={pendingTemplateProcessStages}
          />
        </CanvasDialogBody>
        <CanvasDialogFooter>
          {!targetProjectPath ? (
            <>
              <DialogClose asChild>
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                size="sm"
                onClick={onOpenProject}
                disabled={openingProject}
              >
                {openingProject ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FolderPlus size={14} />
                )}
                Add project
              </Button>
            </>
          ) : (
            <>
              <DialogClose asChild>
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                variant="outline"
                size="sm"
                disabled={!pendingTemplate || templateAction !== null}
                isLoading={templateAction === "customize"}
                loadingText="Opening with agent"
                onClick={() => pendingTemplate && onCustomize(pendingTemplate)}
              >
                Refine with agent
              </Button>
              <Button
                size="sm"
                disabled={!pendingTemplate || templateAction !== null}
                isLoading={templateAction === "create"}
                loadingText="Creating flow"
                onClick={() => pendingTemplate && onCreate(pendingTemplate)}
              >
                {pendingPrimaryActionLabel}
              </Button>
            </>
          )}
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
