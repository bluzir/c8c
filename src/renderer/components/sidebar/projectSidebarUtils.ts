import type { RunResult, RunStatus, WorkflowFile } from "@shared/types"
import { buildRunProgressSummary } from "@/lib/run-progress"
import type { WorkflowExecutionState } from "@/lib/workflow-execution"

export function resolveProjectRowSelectionState(
  projectPath: string,
  selectedProject: string | null,
  isExpanded: boolean,
): {
  shouldSelectProject: boolean
  nextExpanded: boolean
} {
  return {
    shouldSelectProject: selectedProject !== projectPath,
    nextExpanded: !isExpanded,
  }
}

export function historicalRunVisual(status?: string): {
  label: string
  progress: number
  barClass: string
  textClass: string
  dotClass: string
} {
  switch (status) {
    case "completed":
      return {
        label: "completed",
        progress: 100,
        barClass: "bg-status-success",
        textClass: "text-status-success",
        dotClass: "border-status-success/30 bg-status-success",
      }
    case "failed":
      return {
        label: "failed",
        progress: 78,
        barClass: "bg-status-danger",
        textClass: "text-status-danger",
        dotClass: "border-status-danger/30 bg-status-danger",
      }
    case "interrupted":
      return {
        label: "interrupted",
        progress: 56,
        barClass: "bg-status-warning",
        textClass: "text-status-warning",
        dotClass: "border-status-warning/30 bg-status-warning",
      }
    case "cancelled":
      return {
        label: "cancelled",
        progress: 40,
        barClass: "bg-muted-foreground/60",
        textClass: "text-muted-foreground",
        dotClass: "border-muted-foreground/20 bg-muted-foreground/70",
      }
    default:
      return {
        label: "no runs yet",
        progress: 0,
        barClass: "bg-muted-foreground/50",
        textClass: "text-muted-foreground",
        dotClass: "border-muted-foreground/20 bg-muted-foreground/45",
      }
  }
}

export function projectFolderName(projectPath: string): string {
  return projectPath.split("/").pop() || projectPath
}

export function formatRelativeTime(updatedAt?: number): string {
  if (!updatedAt) return ""
  const deltaMs = Date.now() - updatedAt
  if (deltaMs < 60_000) return "now"
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

export function workflowHasActiveRunStatus(status?: string): boolean {
  return (
    status === "starting" ||
    status === "running" ||
    status === "paused" ||
    status === "cancelling"
  )
}

export function latestRunByWorkflowPath(
  pastRuns: RunResult[],
): Map<string, RunResult> {
  const result = new Map<string, RunResult>()
  for (const run of pastRuns) {
    const path = run.workflowPath
    if (!path || result.has(path)) continue
    result.set(path, run)
  }
  return result
}

export function isSidebarWorkflowReviewableRun(
  run?: Pick<RunResult, "status"> | null,
) {
  return (
    run?.status === "completed" ||
    run?.status === "failed" ||
    run?.status === "cancelled" ||
    run?.status === "interrupted"
  )
}

export function resolveWorkflowLaunchTimestamp({
  executionState,
  latestRun,
}: {
  executionState?: Pick<WorkflowExecutionState, "runStartedAt"> | null
  latestRun?: Pick<RunResult, "startedAt"> | null
}): number {
  const activeStartedAt =
    typeof executionState?.runStartedAt === "number"
      ? executionState.runStartedAt
      : 0
  const latestStartedAt =
    typeof latestRun?.startedAt === "number" ? latestRun.startedAt : 0
  return Math.max(activeStartedAt, latestStartedAt)
}

export function compareSidebarWorkflowsByLaunchTime({
  leftWorkflow,
  rightWorkflow,
  leftExecutionState,
  rightExecutionState,
  leftLatestRun,
  rightLatestRun,
}: {
  leftWorkflow: WorkflowFile
  rightWorkflow: WorkflowFile
  leftExecutionState?: Pick<WorkflowExecutionState, "runStartedAt"> | null
  rightExecutionState?: Pick<WorkflowExecutionState, "runStartedAt"> | null
  leftLatestRun?: Pick<RunResult, "startedAt"> | null
  rightLatestRun?: Pick<RunResult, "startedAt"> | null
}): number {
  const leftLaunchAt = resolveWorkflowLaunchTimestamp({
    executionState: leftExecutionState,
    latestRun: leftLatestRun,
  })
  const rightLaunchAt = resolveWorkflowLaunchTimestamp({
    executionState: rightExecutionState,
    latestRun: rightLatestRun,
  })

  if (leftLaunchAt !== rightLaunchAt) return rightLaunchAt - leftLaunchAt
  return (rightWorkflow.updatedAt || 0) - (leftWorkflow.updatedAt || 0)
}

export interface SidebarWorkflowSummary {
  detailLabel: string | null
}

export type SidebarWorkflowBaseState =
  | "new"
  | "idle"
  | "running"
  | "paused"
  | "blocked"
export type SidebarWorkflowNotificationTone =
  | "none"
  | "success"
  | "warning"
  | "error"

export interface SidebarWorkflowRowState {
  baseState: SidebarWorkflowBaseState
  unreadNotification: SidebarWorkflowNotificationTone
  unreadNotificationTitle: string | null
  statusLabel: string | null
  statusBadgeClass: string | null
  showStatusSpinner: boolean
}

function hasWaitingHumanDecision(
  executionState?: WorkflowExecutionState | null,
): boolean {
  if (!executionState) return false
  return Object.values(executionState.nodeStates).some(
    (nodeState) =>
      nodeState.status === "waiting_approval" ||
      nodeState.status === "waiting_human",
  )
}

export function deriveSidebarWorkflowBaseState({
  executionState,
  latestRun,
  approvalCount = 0,
}: {
  executionState?: WorkflowExecutionState | null
  latestRun?: Pick<RunResult, "status"> | null
  approvalCount?: number
}): SidebarWorkflowBaseState {
  const runStatus = executionState?.runStatus ?? "idle"
  const runOutcome = executionState?.runOutcome ?? null

  if (
    approvalCount > 0 ||
    runOutcome === "blocked" ||
    hasWaitingHumanDecision(executionState)
  ) {
    return "blocked"
  }
  if (runStatus === "paused") return "paused"
  if (
    runStatus === "starting" ||
    runStatus === "running" ||
    runStatus === "cancelling"
  ) {
    return "running"
  }
  if (latestRun || runStatus === "done" || runStatus === "error") return "idle"
  return "new"
}

export function sidebarNotificationToneForRunStatus(
  status?: RunStatus | null,
): SidebarWorkflowNotificationTone {
  switch (status) {
    case "completed":
      return "success"
    case "cancelled":
    case "interrupted":
      return "warning"
    case "failed":
      return "error"
    default:
      return "none"
  }
}

function unreadNotificationTitle(
  unreadNotification: SidebarWorkflowNotificationTone,
  latestRun?: Pick<RunResult, "status"> | null,
): string | null {
  if (!latestRun) return null
  if (unreadNotification === "success") return "New completed result"
  if (unreadNotification === "warning")
    return latestRun.status === "cancelled"
      ? "New cancelled run"
      : "New run needs review"
  if (unreadNotification === "error") return "New failed run"
  return null
}

export function deriveSidebarWorkflowRowState({
  executionState,
  latestRun,
  approvalCount = 0,
  seenRunId,
  isSelected = false,
}: {
  executionState?: WorkflowExecutionState | null
  latestRun?: Pick<RunResult, "runId" | "status"> | null
  approvalCount?: number
  seenRunId?: string | null
  isSelected?: boolean
}): SidebarWorkflowRowState {
  const baseState = deriveSidebarWorkflowBaseState({
    executionState,
    latestRun,
    approvalCount,
  })
  const unreadNotification =
    !isSelected &&
    baseState === "idle" &&
    latestRun?.runId &&
    latestRun.runId !== seenRunId
      ? sidebarNotificationToneForRunStatus(latestRun.status)
      : "none"

  if (baseState === "running") {
    return {
      baseState,
      unreadNotification: "none",
      unreadNotificationTitle: null,
      statusLabel: "Running",
      statusBadgeClass: "ui-status-badge-info",
      showStatusSpinner: true,
    }
  }

  if (baseState === "paused") {
    return {
      baseState,
      unreadNotification: "none",
      unreadNotificationTitle: null,
      statusLabel: "Paused",
      statusBadgeClass: "ui-status-badge-warning",
      showStatusSpinner: false,
    }
  }

  if (baseState === "blocked") {
    return {
      baseState,
      unreadNotification: "none",
      unreadNotificationTitle: null,
      statusLabel: "Needs approval",
      statusBadgeClass: "ui-status-badge-warning",
      showStatusSpinner: false,
    }
  }

  if (baseState === "new") {
    return {
      baseState,
      unreadNotification: "none",
      unreadNotificationTitle: null,
      statusLabel: "New",
      statusBadgeClass:
        "ui-status-badge border border-hairline bg-surface-2/80 text-muted-foreground",
      showStatusSpinner: false,
    }
  }

  return {
    baseState,
    unreadNotification,
    unreadNotificationTitle: unreadNotificationTitle(
      unreadNotification,
      latestRun,
    ),
    statusLabel: null,
    statusBadgeClass: null,
    showStatusSpinner: false,
  }
}

export function buildSidebarWorkflowSummary({
  executionState,
}: {
  executionState?: WorkflowExecutionState | null
}): SidebarWorkflowSummary {
  if (
    executionState &&
    (workflowHasActiveRunStatus(executionState.runStatus) ||
      executionState.runStatus === "done" ||
      executionState.runStatus === "error") &&
    executionState.workflowSnapshot
  ) {
    const summary = buildRunProgressSummary({
      workflow: executionState.workflowSnapshot,
      runtimeNodes: executionState.runtimeNodes,
      runtimeMeta: executionState.runtimeMeta,
      nodeStates: executionState.nodeStates,
      runStatus: executionState.runStatus,
      runOutcome: executionState.runOutcome,
      activeNodeId: executionState.activeNodeId,
    })

    return {
      detailLabel: workflowHasActiveRunStatus(executionState.runStatus)
        ? summary.activeStepLabel || summary.branchLabel || null
        : null,
    }
  }

  return {
    detailLabel: null,
  }
}
