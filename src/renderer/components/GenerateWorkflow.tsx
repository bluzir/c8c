import { useEffect, useMemo, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  generateDialogOpenAtom,
  globalDetailBudgetAtom,
  currentWorkflowAtom,
  selectedInboxTaskKeyAtom,
  selectedWorkflowTemplateContextAtom,
  skillsAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  setWorkflowTemplateContextForKeyAtom,
  workflowEntryStateAtom,
  workflowSavedSnapshotAtom,
  workflowsAtom,
} from "@/lib/store"
import { runStatusAtom, selectedPastRunAtom } from "@/features/execution"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogFooter,
  CanvasDialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Sparkles } from "lucide-react"
import { useWorkflowGeneration } from "@/hooks/useWorkflowGeneration"
import { buildGeneratedWorkflowEntryState } from "@/lib/workflow-entry"
import { getReplaceCurrentWorkflowBlockedReason } from "@/lib/run-guards"
import { projectFolderName } from "@/components/sidebar/projectSidebarUtils"

const STEP_LABELS: Record<string, string> = {
  starting: "Getting the draft ready...",
  thinking: "Understanding the job...",
  writing: "Shaping the flow...",
  parsing: "Opening a runnable draft...",
  done: "Ready to review.",
}

export function GenerateWorkflow() {
  const [open, setOpen] = useAtom(generateDialogOpenAtom)
  const [workflow, setWorkflow] = useAtom(currentWorkflowAtom)
  const [detailBudget] = useAtom(globalDetailBudgetAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(
    selectedWorkflowPathAtom,
  )
  const [selectedWorkflowTemplateContext] = useAtom(
    selectedWorkflowTemplateContextAtom,
  )
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setWorkflows] = useAtom(workflowsAtom)
  const [selectedInboxTaskKey, setSelectedInboxTaskKey] = useAtom(
    selectedInboxTaskKeyAtom,
  )
  const [selectedPastRun, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const [workflowEntryState, setWorkflowEntryState] = useAtom(
    workflowEntryStateAtom,
  )
  const setWorkflowTemplateContextForKey = useSetAtom(
    setWorkflowTemplateContextForKeyAtom,
  )
  const [skills, setSkills] = useAtom(skillsAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const [runStatus] = useAtom(runStatusAtom)
  const [target, setTarget] = useState<"replace" | "new">("new")
  const {
    description,
    setDescription,
    generating,
    error,
    progress,
    generate,
    handleDialogOpenChange,
  } = useWorkflowGeneration({
    workflow,
    setWorkflow,
    selectedWorkflowPath,
    setSelectedWorkflowPath,
    setWorkflowSavedSnapshot,
    setWorkflows,
    selectedInboxTaskKey,
    setSelectedInboxTaskKey,
    selectedPastRun,
    setSelectedPastRun,
    workflowEntryState,
    setWorkflowEntryState,
    selectedWorkflowTemplateContext,
    setWorkflowTemplateContextForKey,
    skills,
    setSkills,
    selectedProject,
    detailBudget,
    onOpenChange: setOpen,
    onGenerated: ({ workflow: nextWorkflow, workflowPath, request }) => {
      setWorkflowEntryState(
        buildGeneratedWorkflowEntryState({
          workflow: nextWorkflow,
          workflowPath,
          request,
          source: "generated",
        }),
      )
    },
  })

  useEffect(() => {
    if (!open) return
    setTarget(selectedProject ? "new" : "replace")
  }, [open, selectedProject])
  const replaceCurrentBlockedReason =
    getReplaceCurrentWorkflowBlockedReason(runStatus)

  const progressLabel = progress
    ? STEP_LABELS[progress.step] || `${progress.step}...`
    : null
  const targetLabel = selectedProject
    ? projectFolderName(selectedProject)
    : null
  const generateButtonLabel = useMemo(() => {
    if (generating) return "Preparing flow..."
    return "Prepare flow"
  }, [generating])

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <CanvasDialogContent className="max-w-lg" showCloseButton={false}>
        <CanvasDialogHeader className="surface-depth-header">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} />
            Create with Agent
          </DialogTitle>
        </CanvasDialogHeader>

        <CanvasDialogBody className="space-y-3 pt-4 surface-panel">
          <p className="text-body-md text-muted-foreground">
            Describe the job, the input you will give it, and the result you
            want back. The agent will prepare a runnable flow you can run or
            refine.
          </p>

          <Textarea
            id="workflow-desc"
            aria-label="Flow description"
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="resize-y"
            placeholder="e.g. Review this repo for UX friction, audit the main flows, group issues by severity, and give me a prioritized action plan"
            disabled={generating}
          />

          {generating && progress && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 ui-meta-text text-muted-foreground"
            >
              <Loader2 size={12} className="animate-spin" />
              <span>{progressLabel}</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="ui-alert-danger text-status-danger"
            >
              {error}
            </div>
          )}

          <div className="ui-meta-text text-muted-foreground pb-1">
            {skills.length > 0
              ? `${skills.length} project and plugin skills are available if the flow needs them.`
              : "No project skills discovered yet. The agent will still prepare a runnable draft."}
          </div>

          <div className="rounded-lg border border-dashed border-hairline ui-slab px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="ui-meta-label text-muted-foreground">
                  How to open the draft
                </p>
                <p className="mt-1 text-body-sm text-foreground">
                  {target === "new"
                    ? targetLabel
                      ? `Open it as a new flow in ${targetLabel}.`
                      : "Select a project first to open this as a new flow."
                    : "Use the current draft as the current flow."}
                </p>
                {target === "replace" && replaceCurrentBlockedReason && (
                  <p className="mt-2 text-body-sm text-status-warning">
                    {replaceCurrentBlockedReason}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {target === "new" && selectedWorkflowPath ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setTarget("replace")}
                    disabled={generating}
                  >
                    Use current flow instead
                  </Button>
                ) : null}
                {target === "replace" && selectedProject ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setTarget("new")}
                    disabled={generating}
                  >
                    Open as new flow instead
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </CanvasDialogBody>

        <CanvasDialogFooter className="surface-panel">
          <Button
            variant="outline"
            aria-label={generating ? "Cancel generation" : "Cancel"}
            onClick={() => handleDialogOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={() => {
              if (target === "replace" && replaceCurrentBlockedReason) return
              void generate(target)
            }}
            disabled={
              !description.trim() ||
              generating ||
              (target === "new" && !selectedProject) ||
              (target === "replace" && Boolean(replaceCurrentBlockedReason))
            }
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                {generateButtonLabel}
              </>
            )}
          </Button>
        </CanvasDialogFooter>
      </CanvasDialogContent>
    </Dialog>
  )
}
