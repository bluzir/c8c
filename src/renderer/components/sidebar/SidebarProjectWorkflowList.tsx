import { useAtomValue } from "jotai"
import { approvalRequestsAtom } from "@/features/execution"
import type { WorkflowExecutionState } from "@/lib/workflow-execution"
import type { RunStatus, WorkflowFile } from "@shared/types"
import {
  deriveSidebarWorkflowRowState,
  formatRelativeTime,
} from "./projectSidebarUtils"
import { SidebarWorkflowRow } from "./SidebarWorkflowRow"
import type { SidebarContextMenuState } from "./SidebarWorkflowDialogs"
import type { WorkflowRunMetrics } from "./useProjectSidebarMetrics"

const PROJECT_WORKFLOW_PREVIEW_LIMIT = 10
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
  const autoExpandWorkflowList =
    !hasSearchQuery &&
    filteredProjectWorkflows
      .slice(PROJECT_WORKFLOW_PREVIEW_LIMIT)
      .some((workflow) => workflow.path === selectedWorkflowPath)
  const visibleProjectWorkflows =
    hasSearchQuery || isWorkflowListExpanded || autoExpandWorkflowList
      ? filteredProjectWorkflows
      : filteredProjectWorkflows.slice(0, PROJECT_WORKFLOW_PREVIEW_LIMIT)
  const approvalCountByWorkflow = approvalRequests.reduce<
    Record<string, number>
  >((acc, request) => {
    acc[request.workflowKey] = (acc[request.workflowKey] || 0) + 1
    return acc
  }, {})
  const shouldShowWorkflowToggle =
    !hasSearchQuery &&
    filteredProjectWorkflows.length > PROJECT_WORKFLOW_PREVIEW_LIMIT

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
          : visibleProjectWorkflows.map((workflow) => {
              const runMetrics = getWorkflowRunMetrics(workflow.path)
              const isSelected = selectedWorkflowPath === workflow.path
              const isDirty = isSelected && workflowDirty
              const { latestRun } = getHistoricalRunVisual(
                projectPath,
                workflow.path,
              )
              const approvalCount = approvalCountByWorkflow[workflow.path] || 0
              const workflowRowState = deriveSidebarWorkflowRowState({
                executionState: workflowExecutionStates[workflow.path],
                latestRun:
                  latestRun?.runId != null && latestRun.status != null
                    ? {
                        runId: latestRun.runId,
                        status: latestRun.status,
                      }
                    : null,
                approvalCount,
                seenRunId: seenRunIds[workflow.path] || null,
                isSelected,
              })
              const idleMetaLabel =
                workflowRowState.baseState === "idle"
                  ? formatRelativeTime(
                      latestRun?.completedAt || workflow.updatedAt,
                    )
                  : null

              return (
                <SidebarWorkflowRow
                  key={workflow.path}
                  workflow={workflow}
                  isSelected={isSelected}
                  isDirty={isDirty}
                  unreadNotification={workflowRowState.unreadNotification}
                  unreadNotificationTitle={
                    workflowRowState.unreadNotificationTitle
                  }
                  idleMetaLabel={idleMetaLabel}
                  statusLabel={workflowRowState.statusLabel}
                  statusBadgeClass={workflowRowState.statusBadgeClass}
                  showStatusSpinner={workflowRowState.showStatusSpinner}
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
            })}
      </div>

      {shouldShowWorkflowToggle && !autoExpandWorkflowList && (
        <button
          type="button"
          data-sidebar-item="true"
          aria-expanded={isWorkflowListExpanded}
          onClick={onToggleExpanded}
          className="ui-pressable ml-1 inline-flex h-6 items-center rounded-md px-1.5 text-sidebar-meta text-muted-foreground hover:bg-sidebar-hover hover:text-foreground ui-transition-colors ui-motion-fast"
        >
          {isWorkflowListExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}
