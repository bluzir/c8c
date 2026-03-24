import { useEffect, useState } from "react"
import type { WorkflowTemplate } from "@shared/types"
import { Badge } from "@/components/ui/badge"
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
import { buildTemplateRoutingPreview } from "@/lib/create-routing-preview"
import {
  deriveTemplateExecutionDisciplineLabels,
  deriveTemplateJobLabel,
} from "@/lib/workflow-entry"

type DeepLinkStartMode = "create" | "replace"

interface DeepLinkTemplateDialogProps {
  template: WorkflowTemplate | null
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: string[]
  targetProject: string | null
  onTargetProjectChange: (value: string) => void
  onCreateInProject: () => void
  onReplaceCurrent: () => void
}

export function DeepLinkTemplateDialog({
  template,
  open,
  onOpenChange,
  projects,
  targetProject,
  onTargetProjectChange,
  onCreateInProject,
  onReplaceCurrent,
}: DeepLinkTemplateDialogProps) {
  const nodeCount = template?.workflow.nodes.length ?? 0
  const sourceBadgeLabel =
    template?.source === "hub" ? "From c8c Hub" : "Remote template"
  const disciplineLabels = template
    ? deriveTemplateExecutionDisciplineLabels(template)
    : []
  const executionSummary = template
    ? template.executionPolicy?.summary?.trim() ||
      (disciplineLabels.length > 0 ? disciplineLabels.join(", ") : null)
    : null
  const routingPreview = template
    ? buildTemplateRoutingPreview({
        template,
        templates: [template],
      })
    : null
  const [startMode, setStartMode] = useState<DeepLinkStartMode>(
    projects.length > 0 ? "create" : "replace",
  )
  const canContinue = startMode === "replace" || Boolean(targetProject)

  useEffect(() => {
    if (!open) return
    setStartMode(projects.length > 0 ? "create" : "replace")
  }, [open, projects.length, template?.name])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CanvasDialogContent showCloseButton={false} size="lg">
        <CanvasDialogHeader>
          <DialogTitle>
            {template
              ? `Start ${deriveTemplateJobLabel(template) || template.name}`
              : "Start this starting point"}
          </DialogTitle>
          <DialogDescription>
            &ldquo;{template?.name}&rdquo; is ready. Choose how to apply it,
            then continue.
          </DialogDescription>
        </CanvasDialogHeader>
        {template && (
          <CanvasDialogBody className="space-y-4">
            {template.description && (
              <p className="text-body-sm text-muted-foreground">
                {template.description}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={template?.source === "hub" ? "outline" : "warning"}
              >
                {sourceBadgeLabel}
              </Badge>
              <span className="ui-meta-text text-muted-foreground">
                {nodeCount} step{nodeCount === 1 ? "" : "s"} ready
              </span>
            </div>
            {template.templatePath ? (
              <div className="rounded-lg border border-hairline px-3 py-3">
                <p className="ui-meta-text text-muted-foreground">Source URL</p>
                <p className="mt-1 break-all text-body-sm text-foreground">
                  {template.templatePath}
                </p>
                {template.source !== "hub" ? (
                  <p className="mt-2 text-body-sm text-status-warning">
                    Review the remote source before continuing.
                  </p>
                ) : null}
              </div>
            ) : null}
            <PendingTemplateDetails
              intentLabel={routingPreview?.helpModeLabel || null}
              startStageLabel={routingPreview?.stageLabel || null}
              executionSummary={executionSummary}
              processStages={routingPreview?.stages || null}
            />
            {projects.length > 0 ? (
              <div className="space-y-1">
                <p className="ui-meta-text text-muted-foreground">
                  Project for new flow
                </p>
                <Select
                  value={targetProject ?? ""}
                  onValueChange={onTargetProjectChange}
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
                Add a project in the sidebar if you want to create this as a new
                flow later.
              </p>
            )}
            <div
              role="radiogroup"
              aria-label="Start mode"
              className="space-y-2"
            >
              {projects.length > 0 ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={startMode === "create"}
                  onClick={() => setStartMode("create")}
                  className={`w-full rounded-lg border px-3 py-3 text-left ui-transition-colors ui-motion-fast ${
                    startMode === "create"
                      ? "border-transparent bg-surface-2/75"
                      : "border-hairline/70 hover:bg-surface-2/45"
                  }`}
                >
                  <p className="text-body-sm font-medium text-foreground">
                    Create in selected project
                  </p>
                  <p className="mt-1 text-body-sm text-muted-foreground">
                    Make a new flow in{" "}
                    {targetProject
                      ? targetProject.split(/[\\/]/).pop() ||
                        "the selected project"
                      : "the selected project"}
                    .
                  </p>
                </button>
              ) : null}
              <button
                type="button"
                role="radio"
                aria-checked={startMode === "replace"}
                onClick={() => setStartMode("replace")}
                className={`w-full rounded-lg border px-3 py-3 text-left ui-transition-colors ui-motion-fast ${
                  startMode === "replace"
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
            </div>
          </CanvasDialogBody>
        )}
        <CanvasDialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            size="sm"
            disabled={!canContinue}
            onClick={() => {
              if (startMode === "create") {
                onCreateInProject()
                return
              }
              onReplaceCurrent()
            }}
          >
            Continue
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
