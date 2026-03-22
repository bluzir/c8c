import type { RefObject } from "react"
import type { HumanTaskField, HumanTaskSnapshot } from "@shared/types"
import { SelectedTaskPanel } from "@/components/notifications/SelectedTaskPanel"
import type { WorkflowBlockedResumeSummary } from "@/lib/workflow-blocked-resume"
import type { TaskStageMeta } from "@/components/notifications/task-ui"

interface WorkflowBlockedTaskPanelProps {
  panelRef: RefObject<HTMLDivElement | null>
  selectedTask: HumanTaskSnapshot | null
  taskSubmitting: boolean
  taskAnswers: Record<string, unknown>
  selectedTaskStageMeta: TaskStageMeta | null
  blockedResumeSummary: WorkflowBlockedResumeSummary | null
  showResumeReviewMode: boolean
  onFieldChange: (field: HumanTaskField, value: unknown) => void
  onSubmit: () => void
  onSubmitAndContinue: () => void
  onReject: () => void
  onInspect: () => void
}

export function WorkflowBlockedTaskPanel({
  panelRef,
  selectedTask,
  taskSubmitting,
  taskAnswers,
  selectedTaskStageMeta,
  blockedResumeSummary,
  showResumeReviewMode,
  onFieldChange,
  onSubmit,
  onSubmitAndContinue,
  onReject,
  onInspect,
}: WorkflowBlockedTaskPanelProps) {
  if (!selectedTask) return null

  return (
    <div ref={panelRef} data-blocked-task-panel="true">
      <SelectedTaskPanel
        selectedTask={selectedTask}
        taskLoading={false}
        taskSubmitting={taskSubmitting}
        taskAnswers={taskAnswers}
        selectedTaskStageMeta={selectedTaskStageMeta}
        blockedSummary={blockedResumeSummary ? {
          statusText: blockedResumeSummary.statusText,
          reasonText: blockedResumeSummary.reasonText,
          inputText: blockedResumeSummary.attachText,
          latestResultText: blockedResumeSummary.latestResultText,
          findings: blockedResumeSummary.findings,
          approveText: selectedTask.kind === "approval"
            ? "Continue this flow after approval."
            : "Submit the requested input and continue the flow.",
          rejectText: "Stop the flow. Saved artifacts stay available for later review.",
        } : null}
        showOpenWorkflowButton={false}
        className="rounded-lg border border-hairline bg-surface-1 px-5 py-4"
        inspectLabel={showResumeReviewMode ? "Inspect saved run" : null}
        onOpenWorkflow={() => {}}
        onFieldChange={onFieldChange}
        onSubmit={onSubmit}
        onSubmitAndContinue={onSubmitAndContinue}
        onReject={onReject}
        onInspect={showResumeReviewMode ? onInspect : null}
      />
    </div>
  )
}
