import { useEffect, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { toast } from "sonner"
import { Activity } from "lucide-react"
import { toastError, toastErrorFromCatch } from "@/lib/toast-error"
import {
  batchDialogOpenAtom,
  batchItemsAtom,
  batchProgressAtom,
  batchStatusAtom,
  currentWorkflowAtom,
  mainViewAtom,
  multiRunDashboardOpenAtom,
  selectedInboxTaskKeyAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
} from "@/lib/store"
import {
  approvalRequestsAtom,
  clearWorkflowExecutionStateAtom,
  pastRunsAtom,
  selectedPastRunAtom,
  updateWorkflowExecutionStateAtom,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import {
  Dialog,
  CanvasDialogBody,
  CanvasDialogContent,
  CanvasDialogHeader,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { createEmptyWorkflow } from "@/lib/default-workflow"
import { useUnsavedChangesDialog } from "@/hooks/useUnsavedChangesDialog"
import type { Workflow } from "@shared/types"
import { MultiRunDashboardDetail } from "./multi-run-dashboard/MultiRunDashboardDetail"
import { MultiRunDashboardSidebar } from "./multi-run-dashboard/MultiRunDashboardSidebar"
import { isRunInFlight, toExecutionStateSnapshot, type DashboardEntry } from "./multi-run-dashboard/dashboardModel"
import { useMultiRunDashboardEntries } from "./multi-run-dashboard/useMultiRunDashboardEntries"

export function MultiRunDashboard() {
  const [open, setOpen] = useAtom(multiRunDashboardOpenAtom)
  const [workflowExecutionStates] = useAtom(workflowExecutionStatesAtom)
  const [approvalRequests] = useAtom(approvalRequestsAtom)
  const [pastRuns] = useAtom(pastRunsAtom)
  const [batchStatus] = useAtom(batchStatusAtom)
  const [batchProgress] = useAtom(batchProgressAtom)
  const [batchItems] = useAtom(batchItemsAtom)
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)
  const [selectedWorkflowPath, setSelectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [, setCurrentWorkflow] = useAtom(currentWorkflowAtom)
  const [, setWorkflowSavedSnapshot] = useAtom(workflowSavedSnapshotAtom)
  const [, setSelectedInboxTaskKey] = useAtom(selectedInboxTaskKeyAtom)
  const [, setSelectedPastRun] = useAtom(selectedPastRunAtom)
  const workflowDirty = useAtomValue(workflowDirtyAtom)
  const [, setMainView] = useAtom(mainViewAtom)
  const setBatchDialogOpen = useSetAtom(batchDialogOpenAtom)
  const updateWorkflowExecutionState = useSetAtom(updateWorkflowExecutionStateAtom)
  const clearWorkflowExecutionState = useSetAtom(clearWorkflowExecutionStateAtom)
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const { confirmDiscard, unsavedChangesDialog } = useUnsavedChangesDialog()

  const {
    entriesWithHistory,
    activeCount,
    aggregateCounts,
    groupedEntries,
  } = useMultiRunDashboardEntries({
    workflowExecutionStates,
    approvalRequests,
    pastRuns,
    selectedWorkflowPath,
  })

  const selectedEntry = entriesWithHistory.find((entry) => entry.workflowKey === selectedEntryKey) || entriesWithHistory[0] || null
  const showBatchEntry = batchStatus === "running" || batchStatus === "done" || batchStatus === "error" || batchItems.length > 0

  useEffect(() => {
    if (!open) return
    if (entriesWithHistory.length === 0) {
      setSelectedEntryKey(null)
      return
    }
    if (!selectedEntryKey || !entriesWithHistory.some((entry) => entry.workflowKey === selectedEntryKey)) {
      setSelectedEntryKey(entriesWithHistory[0].workflowKey)
    }
  }, [entriesWithHistory, open, selectedEntryKey])

  useEffect(() => {
    if (!open || activeCount === 0) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activeCount, open])

  const focusWorkflow = async (entry: DashboardEntry) => {
    const clearReviewState = () => {
      setSelectedInboxTaskKey(null)
      setSelectedPastRun(null)
    }

    if (entry.isSelectedWorkflow) {
      clearReviewState()
      setMainView("thread")
      setOpen(false)
      return
    }
    if (!(await confirmDiscard("open another flow", workflowDirty))) {
      return
    }

    if (entry.projectPath && entry.projectPath !== selectedProject) {
      setSelectedProject(entry.projectPath)
    }

    setMainView("thread")

    const restoreWorkflowSnapshot = (snapshot: Workflow | null) => {
      if (!snapshot) return false
      const restoredWorkflow = structuredClone(snapshot)
      setSelectedWorkflowPath(null)
      setCurrentWorkflow(restoredWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(createEmptyWorkflow()))
      clearReviewState()
      return true
    }

    if (entry.workflowPath) {
      try {
        const loadedWorkflow = await window.api.loadWorkflow(entry.workflowPath)
        setSelectedWorkflowPath(entry.workflowPath)
        setCurrentWorkflow(loadedWorkflow)
        setWorkflowSavedSnapshot(workflowSnapshot(loadedWorkflow))
        clearReviewState()
        setOpen(false)
        return
      } catch (error) {
        if (!restoreWorkflowSnapshot(entry.workflowSnapshot)) {
          toastErrorFromCatch("Could not open flow", error)
          return
        }
      }
    } else if (!restoreWorkflowSnapshot(entry.workflowSnapshot)) {
      toastError("Could not open flow", {
        description: "This dashboard entry does not have a restorable flow snapshot.",
      })
      return
    }

    setOpen(false)
  }

  const pauseExecution = async (entry: DashboardEntry) => {
    if (!entry.runId) return
    try {
      const paused = await window.api.pauseRun(entry.runId)
      if (!paused) {
        toastError("Could not pause run")
        return
      }
      updateWorkflowExecutionState({
        key: entry.workflowKey,
        update: (previous) => ({ ...previous, runStatus: "paused" }),
      })
    } catch (error) {
      toastErrorFromCatch("Could not pause run", error)
    }
  }

  const resumeExecution = async (entry: DashboardEntry) => {
    if (!entry.runId) return
    try {
      const resumed = await window.api.resumeRun(entry.runId)
      if (!resumed) {
        toastError("Could not resume run")
        return
      }
      updateWorkflowExecutionState({
        key: entry.workflowKey,
        update: (previous) => ({ ...previous, runStatus: "running" }),
      })
    } catch (error) {
      toastErrorFromCatch("Could not resume run", error)
    }
  }

  const cancelExecution = async (entry: DashboardEntry) => {
    if (!entry.runId) return
    updateWorkflowExecutionState({
      key: entry.workflowKey,
      update: (previous) => ({ ...previous, runStatus: "cancelling" }),
    })
    try {
      const cancelled = await window.api.cancelRun(entry.runId)
      if (!cancelled) {
        updateWorkflowExecutionState({
          key: entry.workflowKey,
          update: (previous) => ({ ...previous, runStatus: entry.runStatus }),
        })
        toastError("Could not stop run")
      }
    } catch (error) {
      updateWorkflowExecutionState({
        key: entry.workflowKey,
        update: (previous) => ({ ...previous, runStatus: entry.runStatus }),
      })
      toastErrorFromCatch("Could not stop run", error)
    }
  }

  const clearEntry = (entry: DashboardEntry) => {
    if (isRunInFlight(entry.runStatus)) return
    const snapshot = toExecutionStateSnapshot(entry)
    clearWorkflowExecutionState(entry.workflowKey)
    toast.success("Removed from triage view", {
      action: {
        label: "Undo",
        onClick: () => {
          updateWorkflowExecutionState({
            key: entry.workflowKey,
            update: snapshot,
          })
          setSelectedEntryKey(entry.workflowKey)
        },
      },
    })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <CanvasDialogContent size="xl" className="max-h-[86vh] flex flex-col p-0 gap-0">
          <CanvasDialogHeader className="surface-depth-header border-b border-hairline">
            <DialogTitle className="flex items-center gap-2">
              <Activity size={16} />
              Runs Dashboard
            </DialogTitle>
            <DialogDescription>
              {activeCount > 0
                ? `${activeCount} run${activeCount === 1 ? "" : "s"} active across flows.`
                : "Inspect recent session runs and jump back into any flow."}
            </DialogDescription>
          </CanvasDialogHeader>

          <CanvasDialogBody className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-0 p-0">
            <MultiRunDashboardSidebar
              entries={entriesWithHistory}
              groupedEntries={groupedEntries}
              aggregateCounts={aggregateCounts}
              selectedEntryKey={selectedEntryKey}
              onSelectEntry={setSelectedEntryKey}
              now={now}
              showBatchEntry={showBatchEntry}
              batchStatus={batchStatus}
              batchProgress={batchProgress}
              batchItemsCount={batchItems.length}
              onOpenBatch={() => setBatchDialogOpen(true)}
            />

            <div className="min-h-0">
              <MultiRunDashboardDetail
                entry={selectedEntry}
                now={now}
                onFocusWorkflow={focusWorkflow}
                onPauseExecution={pauseExecution}
                onResumeExecution={resumeExecution}
                onCancelExecution={cancelExecution}
                onClearEntry={clearEntry}
              />
            </div>
          </CanvasDialogBody>
        </CanvasDialogContent>
      </Dialog>
      {unsavedChangesDialog}
    </>
  )
}
