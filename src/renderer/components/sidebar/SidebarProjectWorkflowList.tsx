import { useMemo } from "react"
import { Plus } from "lucide-react"
import { useAtomValue } from "jotai"
import { approvalRequestsAtom } from "@/features/execution"
import type { WorkflowExecutionState } from "@/lib/workflow-execution"
import type { RunStatus, WorkflowFile } from "@shared/types"
import {
  deriveSidebarWorkflowRowState,
  formatRelativeTime,
  isActiveWorkflowBaseState,
  type SidebarWorkflowRowState,
} from "./projectSidebarUtils"
import { SidebarWorkflowRow } from "./SidebarWorkflowRow"
import type { SidebarContextMenuState } from "./SidebarWorkflowDialogs"
import type { WorkflowRunMetrics } from "./useProjectSidebarMetrics"

const PROJECT_WORKFLOW_LOADING_ROWS = 3

interface SidebarProjectWorkflowListProps {
  projectPath: string
  projectLabel: string
  projectWorkflows: WorkflowFile[]
  isProjectLoading: boolean
  workflowSearchQuery: string
  isWorkflowListExpanded: boolean
  selectedWorkflowPath: string | null
  workflowDirty: boolean
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  seenRunIds: Record<string, string>
  getWorkflowRunMetrics: (workflowPath: string) => WorkflowRunMetrics
  getHistoricalRunVisual: (
    projectPath: string,
    workflowPath: string,
  ) => {
    latestRun?: {
      runId?: string
      status?: RunStatus
      completedAt?: number
    } | null
  }
  sortProjectWorkflows: (
    projectPath: string,
    projectWorkflows: WorkflowFile[],
  ) => WorkflowFile[]
  onToggleExpanded: () => void
  onOpenWorkflow: (workflow: WorkflowFile) => void
  onRenameWorkflow: (workflow: WorkflowFile) => void
  onWorkflowContextMenu: (payload: SidebarContextMenuState) => void
  onCreateFlow?: () => void
}

interface WorkflowWithDerivedState {
  workflow: WorkflowFile
  rowState: SidebarWorkflowRowState
  latestRun?: {
    runId?: string
    status?: RunStatus
    completedAt?: number
  } | null
}

export function SidebarProjectWorkflowList({
  projectPath,
  projectLabel,
  projectWorkflows,
  isProjectLoading,
  workflowSearchQuery,
  isWorkflowListExpanded,
  selectedWorkflowPath,
  workflowDirty,
  workflowExecutionStates,
  seenRunIds,
  getWorkflowRunMetrics,
  getHistoricalRunVisual,
  sortProjectWorkflows,
  onToggleExpanded,
  onOpenWorkflow,
  onRenameWorkflow,
  onWorkflowContextMenu,
  onCreateFlow,
}: SidebarProjectWorkflowListProps) {
  const approvalRequests = useAtomValue(approvalRequestsAtom)
  const hasSearchQuery = workflowSearchQuery.trim().length > 0
  const filteredProjectWorkflows = sortProjectWorkflows(
    projectPath,
    projectWorkflows,
  ).filter((workflow) => {
    if (!hasSearchQuery) return true
    return workflow.name
      .toLowerCase()
      .includes(workflowSearchQuery.trim().toLowerCase())
  })
  const approvalCountByWorkflow = approvalRequests.reduce<
    Record<string, number>
  >((acc, request) => {
    acc[request.workflowKey] = (acc[request.workflowKey] || 0) + 1
    return acc
  }, {})

  // Derive row state for each workflow and partition into active/idle
  const { activeWorkflows, idleWorkflows } = useMemo(() => {
    const active: WorkflowWithDerivedState[] = []
    const idle: WorkflowWithDerivedState[] = []

    for (const workflow of filteredProjectWorkflows) {
      const { latestRun } = getHistoricalRunVisual(projectPath, workflow.path)
      const isSelected = selectedWorkflowPath === workflow.path
      const approvalCount = approvalCountByWorkflow[workflow.path] || 0
      const rowState = deriveSidebarWorkflowRowState({
        executionState: workflowExecutionStates[workflow.path],
        latestRun:
          latestRun?.runId != null && latestRun.status != null
            ? { runId: latestRun.runId, status: latestRun.status }
            : null,
        approvalCount,
        seenRunId: seenRunIds[workflow.path] || null,
        isSelected,
      })

      const entry: WorkflowWithDerivedState = { workflow, rowState, latestRun }
      if (isActiveWorkflowBaseState(rowState.baseState)) {
        active.push(entry)
      } else {
        idle.push(entry)
      }
    }

    return { activeWorkflows: active, idleWorkflows: idle }
  }, [
    filteredProjectWorkflows,
    getHistoricalRunVisual,
    projectPath,
    selectedWorkflowPath,
    approvalCountByWorkflow,
    workflowExecutionStates,
    seenRunIds,
  ])

  const renderWorkflowRow = (entry: WorkflowWithDerivedState) => {
    const { workflow, rowState, latestRun } = entry
    const runMetrics = getWorkflowRunMetrics(workflow.path)
    const isSelected = selectedWorkflowPath === workflow.path
    const isDirty = isSelected && workflowDirty
    const idleMetaLabel =
      rowState.baseState === "idle"
        ? formatRelativeTime(latestRun?.completedAt || workflow.updatedAt)
        : null

    return (
      <SidebarWorkflowRow
        key={workflow.path}
        workflow={workflow}
        isSelected={isSelected}
        isDirty={isDirty}
        unreadNotification={rowState.unreadNotification}
        unreadNotificationTitle={rowState.unreadNotificationTitle}
        idleMetaLabel={idleMetaLabel}
        statusLabel={rowState.statusLabel}
        statusBadgeClass={rowState.statusBadgeClass}
        showStatusSpinner={rowState.showStatusSpinner}
        progress={runMetrics.progress}
        progressBarClass={runMetrics.barClass}
        runStatus={runMetrics.runStatus}
        showProgressTrack={runMetrics.showProgressTrack}
        onOpen={() => onOpenWorkflow(workflow)}
        onRename={() => onRenameWorkflow(workflow)}
        onContextMenu={(event) => {
          onWorkflowContextMenu({
            x: event.clientX,
            y: event.clientY,
            scope: "workflow",
            workflow,
            projectPath,
          })
        }}
      />
    )
  }

  // When searching, show all results flat (no active/idle split)
  if (hasSearchQuery) {
    return (
      <div className="mt-0.5 ml-7 space-y-px">
        <div role="list" aria-label={`${projectLabel} flows`}>
          {filteredProjectWorkflows.length === 0
            ? null
            : [...activeWorkflows, ...idleWorkflows].map(renderWorkflowRow)}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-0.5 ml-7 space-y-px">
      <div role="list" aria-label={`${projectLabel} flows`}>
        {isProjectLoading && filteredProjectWorkflows.length === 0
          ? Array.from(
              { length: PROJECT_WORKFLOW_LOADING_ROWS },
              (_, index) => (
                <div
                  key={`loading-${projectPath}-${index}`}
                  className="sidebar-thread-row"
                  aria-hidden="true"
                >
                  <div className="flex items-center gap-1.5 px-1 py-0.5">
                    <span className="min-w-0 flex-1">
                      <span className="block h-3.5 w-[72%] rounded bg-muted-foreground/12" />
                    </span>
                    <span className="h-3 w-7 rounded bg-muted-foreground/10" />
                  </div>
                </div>
              ),
            )
          : (
              <>
                {/* Active workflows — always visible */}
                {activeWorkflows.map(renderWorkflowRow)}

                {/* Idle workflows — behind disclosure toggle */}
                {isWorkflowListExpanded &&
                  idleWorkflows.map(renderWorkflowRow)}
              </>
            )}
      </div>

      {/* Empty state — project expanded but has no flows */}
      {!isProjectLoading &&
        filteredProjectWorkflows.length === 0 &&
        !hasSearchQuery &&
        onCreateFlow && (
          <div className="px-1 py-2">
            <button
              type="button"
              data-sidebar-item="true"
              onClick={onCreateFlow}
              className="ui-pressable inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-sidebar-item text-muted-foreground/70 hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
            >
              <Plus size={12} strokeWidth={2} className="shrink-0" />
              No flows yet — create one
            </button>
          </div>
        )}

      {idleWorkflows.length > 0 && (
        <button
          type="button"
          data-sidebar-item="true"
          aria-expanded={isWorkflowListExpanded}
          onClick={onToggleExpanded}
          className="ui-pressable ml-1 inline-flex h-6 items-center rounded-md px-1.5 text-sidebar-meta text-muted-foreground hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
        >
          {isWorkflowListExpanded
            ? "Show less"
            : `${idleWorkflows.length} earlier flow${idleWorkflows.length === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  )
}
