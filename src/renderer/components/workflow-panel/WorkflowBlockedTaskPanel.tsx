import { useEffect, type RefObject } from "react"
import { useAtomValue } from "jotai"
import type { HumanTaskField, HumanTaskSnapshot } from "@shared/types"
import { SelectedTaskPanel } from "@/components/notifications/SelectedTaskPanel"
import { hasMissingRequiredTaskAnswers } from "@/components/notifications/task-ui"
import {
  consumeShortcut,
  isShortcutConsumed,
  matchesPrimaryShortcut,
} from "@/lib/keyboard-shortcuts"
import { desktopRuntimeAtom } from "@/lib/store"
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
  const desktopRuntime = useAtomValue(desktopRuntimeAtom)
  const hasMissingRequiredFields = selectedTask
    ? hasMissingRequiredTaskAnswers(selectedTask, taskAnswers)
    : false

  useEffect(() => {
    if (!selectedTask || taskSubmitting || hasMissingRequiredFields) return

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return
      if (
        !matchesPrimaryShortcut(event, {
          key: "Enter",
          primaryModifierKey: desktopRuntime.primaryModifierKey,
        })
      )
        return
      consumeShortcut(event)
      if (selectedTask.workflowPath) {
        onSubmitAndContinue()
        return
      }
      onSubmit()
    }

    window.addEventListener("keydown", handler, true)
    return () => {
      window.removeEventListener("keydown", handler, true)
    }
  }, [
    desktopRuntime.primaryModifierKey,
    hasMissingRequiredFields,
    onSubmit,
    onSubmitAndContinue,
    selectedTask,
    taskSubmitting,
  ])

  if (!selectedTask) return null

  return (
    <div ref={panelRef} data-blocked-task-panel="true">
      <SelectedTaskPanel
        selectedTask={selectedTask}
        taskLoading={false}
        taskSubmitting={taskSubmitting}
        taskAnswers={taskAnswers}
        selectedTaskStageMeta={selectedTaskStageMeta}
        blockedSummary={
          blockedResumeSummary
            ? {
                statusText: blockedResumeSummary.statusText,
                reasonText: blockedResumeSummary.reasonText,
                inputText: blockedResumeSummary.attachText,
                latestResultText: blockedResumeSummary.latestResultText,
                findings: blockedResumeSummary.findings,
                approveText:
                  selectedTask.kind === "approval"
                    ? "Continue this flow after approval."
                    : "Submit the requested input and continue the flow.",
                rejectText:
                  "Stop the flow. Saved results stay available for later review.",
              }
            : null
        }
        showOpenWorkflowButton={false}
        primaryActionShortcutLabel={`${desktopRuntime.primaryModifierLabel}↵`}
        className="surface-figure p-5"
        inspectLabel={showResumeReviewMode ? "Inspect saved run" : null}
        onFieldChange={onFieldChange}
        onSubmit={onSubmit}
        onSubmitAndContinue={onSubmitAndContinue}
        onReject={onReject}
        onInspect={showResumeReviewMode ? onInspect : null}
      />
    </div>
  )
}
