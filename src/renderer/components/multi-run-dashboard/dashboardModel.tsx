import type { RunResult } from "@shared/types"
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash2,
  Loader2,
  Pause,
  XCircle,
} from "lucide-react"
import type { WorkflowExecutionState } from "@/features/execution"
import { getWorkflowNodeLabel } from "@/lib/workflow-labels"
import { resolveWorkflowRunDisplayState } from "@/lib/workflow-run-display-state"

export type DashboardEntryGroupId = "needs_action" | "running" | "recent"

export interface DashboardEntry extends WorkflowExecutionState {
  workflowKey: string
  workflowPath: string | null
  approvalCount: number
  approvalMessages: string[]
  isSelectedWorkflow: boolean
  activeNodeLabel: string | null
  progress: ReturnType<typeof summarizeExecution>
  pastRun: RunResult | null
}

export function isRunInFlight(
  status: WorkflowExecutionState["runStatus"],
): boolean {
  return (
    status === "starting" ||
    status === "running" ||
    status === "paused" ||
    status === "cancelling"
  )
}

export function isDashboardVisibleState(
  state: WorkflowExecutionState,
): boolean {
  return (
    isRunInFlight(state.runStatus) ||
    state.runOutcome !== null ||
    state.workspace !== null ||
    state.reportPath !== null ||
    state.finalContent.trim().length > 0 ||
    state.lastError !== null ||
    Object.keys(state.nodeStates).length > 0
  )
}

export function folderName(path: string | null): string {
  if (!path) return "No project"
  return path.split(/[\\/]/).pop() || path
}

export function formatDateTime(timestamp: number | null): string {
  if (!timestamp) return "Not available"
  return new Date(timestamp).toLocaleString()
}

function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs == null || durationMs < 0) return "Not available"
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

export function outcomeLabel(entry: DashboardEntry): string {
  return resolveWorkflowRunDisplayState({
    runStatus: entry.runStatus,
    runOutcome: entry.runOutcome,
    approvalCount: entry.approvalCount,
    lastError: entry.lastError,
  }).label
}

export function outcomeClasses(entry: DashboardEntry): string {
  const tone = resolveWorkflowRunDisplayState({
    runStatus: entry.runStatus,
    runOutcome: entry.runOutcome,
    approvalCount: entry.approvalCount,
    lastError: entry.lastError,
  }).tone

  if (tone === "warning") return "ui-status-badge-warning"
  if (tone === "danger") return "ui-status-badge-danger"
  if (tone === "success") return "ui-status-badge-success"
  return "ui-status-badge-info"
}

export function outcomeIcon(entry: DashboardEntry) {
  const runDisplayState = resolveWorkflowRunDisplayState({
    runStatus: entry.runStatus,
    runOutcome: entry.runOutcome,
    approvalCount: entry.approvalCount,
    lastError: entry.lastError,
  })

  if (
    runDisplayState.state === "starting" ||
    runDisplayState.state === "running" ||
    runDisplayState.state === "cancelling"
  ) {
    return <Loader2 size={12} className="animate-spin" aria-hidden="true" />
  }
  if (runDisplayState.state === "paused") {
    return <Pause size={12} aria-hidden="true" />
  }
  if (runDisplayState.state === "blocked") {
    return <AlertTriangle size={12} aria-hidden="true" />
  }
  if (runDisplayState.state === "failed") {
    return <XCircle size={12} aria-hidden="true" />
  }
  if (runDisplayState.state === "cancelled") {
    return <CircleSlash2 size={12} aria-hidden="true" />
  }
  return <CheckCircle2 size={12} aria-hidden="true" />
}

function buildNodeLabel(
  state: WorkflowExecutionState,
  nodeId: string | null,
): string | null {
  if (!nodeId) return null
  const runtimeNode = state.runtimeNodes.find((node) => node.id === nodeId)
  if (runtimeNode) return getWorkflowNodeLabel(runtimeNode)
  const workflowNode = state.workflowSnapshot?.nodes.find(
    (node) => node.id === nodeId,
  )
  if (workflowNode) return getWorkflowNodeLabel(workflowNode)
  if (nodeId.includes("::")) {
    const runtimeMeta = state.runtimeMeta[nodeId]
    if (runtimeMeta) {
      return `branch: ${runtimeMeta.subtaskKey} (${runtimeMeta.branchIndex + 1}/${runtimeMeta.totalBranches})`
    }
  }
  return nodeId
}

export function summarizeExecution(state: WorkflowExecutionState) {
  const nodeTypeById = new Map(
    (state.runtimeNodes.length > 0
      ? state.runtimeNodes
      : state.workflowSnapshot?.nodes || []
    ).map((node) => [node.id, node.type]),
  )
  const stepNodeIds = new Set<string>()
  for (const [nodeId, nodeType] of nodeTypeById.entries()) {
    if (nodeType !== "input" && nodeType !== "output") {
      stepNodeIds.add(nodeId)
    }
  }
  for (const nodeId of Object.keys(state.nodeStates)) {
    const nodeType = nodeTypeById.get(nodeId)
    if (
      (nodeType && nodeType !== "input" && nodeType !== "output") ||
      nodeId.includes("::")
    ) {
      stepNodeIds.add(nodeId)
    }
  }

  let completedSteps = 0
  let runningSteps = 0
  let waitingApprovalSteps = 0
  let failedSteps = 0

  for (const nodeId of stepNodeIds) {
    const status = state.nodeStates[nodeId]?.status || "pending"
    if (status === "completed" || status === "skipped") completedSteps += 1
    if (status === "running") runningSteps += 1
    if (status === "waiting_approval" || status === "waiting_human")
      waitingApprovalSteps += 1
    if (status === "failed") failedSteps += 1
  }

  return {
    totalSteps: stepNodeIds.size,
    completedSteps,
    runningSteps,
    waitingApprovalSteps,
    failedSteps,
  }
}

function buildEntrySortTimestamp(entry: DashboardEntry): number {
  return (
    entry.lastUpdatedAt ||
    entry.completedAt ||
    entry.runStartedAt ||
    entry.pastRun?.completedAt ||
    entry.pastRun?.startedAt ||
    0
  )
}

export function summarizeCost(entry: DashboardEntry): {
  totalCost: number
  totalTokens: number
} {
  if (
    entry.pastRun?.totalCost != null ||
    entry.pastRun?.totalTokensIn != null ||
    entry.pastRun?.totalTokensOut != null
  ) {
    return {
      totalCost: entry.pastRun.totalCost || 0,
      totalTokens:
        (entry.pastRun.totalTokensIn || 0) +
        (entry.pastRun.totalTokensOut || 0),
    }
  }

  let totalCost = 0
  let totalTokens = 0
  for (const nodeState of Object.values(entry.nodeStates)) {
    if (nodeState.metrics) {
      totalCost += nodeState.metrics.cost_usd || 0
      totalTokens +=
        (nodeState.metrics.tokens_in || 0) + (nodeState.metrics.tokens_out || 0)
    }
  }
  return { totalCost, totalTokens }
}

export function isFailureEntry(entry: DashboardEntry): boolean {
  return resolveWorkflowRunDisplayState({
    runStatus: entry.runStatus,
    runOutcome: entry.runOutcome,
    approvalCount: entry.approvalCount,
    lastError: entry.lastError,
  }).isFailure
}

export function triageGroup(entry: DashboardEntry): DashboardEntryGroupId {
  const runDisplayState = resolveWorkflowRunDisplayState({
    runStatus: entry.runStatus,
    runOutcome: entry.runOutcome,
    approvalCount: entry.approvalCount,
    lastError: entry.lastError,
  })
  if (runDisplayState.needsAttention) return "needs_action"
  if (runDisplayState.state === "paused" || runDisplayState.isInFlight)
    return "running"
  return "recent"
}

function triagePriority(entry: DashboardEntry): number {
  const runDisplayState = resolveWorkflowRunDisplayState({
    runStatus: entry.runStatus,
    runOutcome: entry.runOutcome,
    approvalCount: entry.approvalCount,
    lastError: entry.lastError,
  })
  if (runDisplayState.state === "blocked") return 0
  if (runDisplayState.state === "failed") return 1
  if (runDisplayState.state === "paused") return 2
  if (runDisplayState.isInFlight) return 3
  if (runDisplayState.state === "completed") return 4
  if (runDisplayState.state === "cancelled") return 5
  return 6
}

function entryDurationMs(entry: DashboardEntry, now: number): number | null {
  if (entry.pastRun?.durationMs != null) return entry.pastRun.durationMs
  if (entry.runStartedAt && isRunInFlight(entry.runStatus)) {
    return Math.max(0, now - entry.runStartedAt)
  }
  if (entry.completedAt && entry.runStartedAt) {
    return Math.max(0, entry.completedAt - entry.runStartedAt)
  }
  return null
}

export function entryDurationLabel(
  entry: DashboardEntry,
  now: number,
): string | null {
  const durationMs = entryDurationMs(entry, now)
  return durationMs == null ? null : formatDurationMs(durationMs)
}

export function entryScanLine(entry: DashboardEntry, now: number): string {
  const parts = [
    entry.progress.totalSteps > 0
      ? `Step ${Math.min(entry.progress.completedSteps, entry.progress.totalSteps)}/${entry.progress.totalSteps}`
      : null,
    entryDurationLabel(entry, now),
    entry.activeNodeLabel && isRunInFlight(entry.runStatus)
      ? entry.activeNodeLabel
      : null,
    entry.approvalCount > 0
      ? `${entry.approvalCount} approval${entry.approvalCount === 1 ? "" : "s"} pending`
      : null,
    isFailureEntry(entry) && !entry.approvalCount ? "Needs review" : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(" · ")
}

export function triageHeadline(entry: DashboardEntry): string {
  const runDisplayState = resolveWorkflowRunDisplayState({
    runStatus: entry.runStatus,
    runOutcome: entry.runOutcome,
    approvalCount: entry.approvalCount,
    lastError: entry.lastError,
  })

  if (runDisplayState.state === "blocked") {
    return entry.approvalCount > 0
      ? `${entry.approvalCount} approval${entry.approvalCount === 1 ? "" : "s"} waiting`
      : "Needs approval"
  }
  if (runDisplayState.state === "failed") {
    return entry.activeNodeLabel
      ? `${entry.activeNodeLabel} failed`
      : "Run failed"
  }
  if (runDisplayState.state === "paused") return "Run paused"
  if (runDisplayState.state === "starting") return "Run starting"
  if (runDisplayState.state === "running") {
    return entry.activeNodeLabel
      ? `${entry.activeNodeLabel} is running`
      : "Run in progress"
  }
  if (runDisplayState.state === "cancelling") return "Run stopping"
  if (runDisplayState.state === "completed") return "Run completed"
  if (runDisplayState.state === "cancelled") return "Run cancelled"
  return "Recent flow state"
}

export function triageSummary(entry: DashboardEntry, now: number): string {
  const parts = [
    folderName(entry.projectPath),
    entry.progress.totalSteps > 0
      ? `Step ${Math.min(entry.progress.completedSteps, entry.progress.totalSteps)}/${entry.progress.totalSteps}`
      : null,
    entryDurationLabel(entry, now),
    entry.approvalCount > 0
      ? `${entry.approvalCount} pending approval${entry.approvalCount === 1 ? "" : "s"}`
      : null,
    entry.lastError && entry.approvalCount === 0
      ? "Open the flow to inspect the failing step."
      : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(" · ")
}

export function primaryActionLabel(entry: DashboardEntry): string {
  const runDisplayState = resolveWorkflowRunDisplayState({
    runStatus: entry.runStatus,
    runOutcome: entry.runOutcome,
    approvalCount: entry.approvalCount,
    lastError: entry.lastError,
  })
  if (runDisplayState.state === "paused" && entry.runId) return "Resume run"
  if (runDisplayState.state === "blocked") return "Review decision"
  if (runDisplayState.state === "failed") return "Inspect failure"
  if (runDisplayState.isInFlight) return "Open live run"
  if (runDisplayState.state === "completed") return "Review result"
  return "Open flow"
}

export function groupMetaLabel(group: DashboardEntryGroupId): string {
  if (group === "needs_action") return "Needs action"
  if (group === "running") return "Running now"
  return "Recent"
}

export function toExecutionStateSnapshot(
  entry: DashboardEntry,
): WorkflowExecutionState {
  const {
    workflowKey: _workflowKey,
    workflowPath: _workflowPath,
    approvalCount: _approvalCount,
    approvalMessages: _approvalMessages,
    isSelectedWorkflow: _isSelectedWorkflow,
    activeNodeLabel: _activeNodeLabel,
    progress: _progress,
    pastRun: _pastRun,
    ...state
  } = entry

  return structuredClone(state)
}

export function buildDashboardEntries({
  workflowExecutionStates,
  approvalRequests,
  pastRuns,
  selectedWorkflowPath,
}: {
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  approvalRequests: Array<{
    workflowKey: string
    message?: string | null
    nodeId: string
  }>
  pastRuns: RunResult[]
  selectedWorkflowPath: string | null
}): DashboardEntry[] {
  const historyByWorkspace = new Map<string, RunResult>()
  const historyByPath = new Map<string, RunResult>()
  for (const run of pastRuns) {
    if (run.workspace && !historyByWorkspace.has(run.workspace)) {
      historyByWorkspace.set(run.workspace, run)
    }
    if (run.workflowPath && !historyByPath.has(run.workflowPath)) {
      historyByPath.set(run.workflowPath, run)
    }
  }

  return Object.entries(workflowExecutionStates)
    .filter(([, state]) => isDashboardVisibleState(state))
    .map(([workflowKey, state]): DashboardEntry => {
      const matchingRequests = approvalRequests.filter(
        (request) => request.workflowKey === workflowKey,
      )
      const workflowPath = workflowKey === "__draft__" ? null : workflowKey
      const matchingPastRun = state.workspace
        ? historyByWorkspace.get(state.workspace)
        : workflowPath
          ? historyByPath.get(workflowPath)
          : undefined
      const progress = summarizeExecution(state)
      return {
        ...state,
        workflowKey,
        workflowPath,
        approvalCount: matchingRequests.length,
        approvalMessages: matchingRequests.map(
          (request) => request.message || request.nodeId,
        ),
        isSelectedWorkflow: selectedWorkflowPath === workflowPath,
        activeNodeLabel: buildNodeLabel(state, state.activeNodeId),
        progress,
        pastRun: matchingPastRun || null,
      }
    })
    .sort((left, right) => {
      const priorityDiff = triagePriority(left) - triagePriority(right)
      if (priorityDiff !== 0) return priorityDiff
      return buildEntrySortTimestamp(right) - buildEntrySortTimestamp(left)
    })
}

export function groupDashboardEntries(entries: DashboardEntry[]) {
  return [
    {
      id: "needs_action" as const,
      label: "Needs action",
      entries: entries.filter((entry) => triageGroup(entry) === "needs_action"),
    },
    {
      id: "running" as const,
      label: "Running now",
      entries: entries.filter((entry) => triageGroup(entry) === "running"),
    },
    {
      id: "recent" as const,
      label: "Recent",
      entries: entries.filter((entry) => triageGroup(entry) === "recent"),
    },
  ].filter((group) => group.entries.length > 0)
}

export function dashboardAggregateCounts(entries: DashboardEntry[]) {
  return {
    needsAction: entries.filter(
      (entry) => triageGroup(entry) === "needs_action",
    ).length,
    running: entries.filter((entry) => triageGroup(entry) === "running").length,
    recent: entries.filter((entry) => triageGroup(entry) === "recent").length,
  }
}

export function approvalMessageTone(entry: DashboardEntry) {
  return entry.approvalCount > 0 ? <AlertTriangle size={14} /> : null
}
