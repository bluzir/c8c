import { useMemo } from "react"
import {
  getRuntimeBranchDetail,
  getRuntimeBranchLabel,
} from "@/lib/runtime-flow-labels"
import type {
  NodeState,
  PersistedRunSnapshot,
  WorkflowRuntimeMeta,
} from "@shared/types"
import type { WorkflowNode } from "@/lib/store"
import type { RuntimeBranchSummary } from "@/components/NodeCard"

const STATUS_PRIORITY: Record<string, number> = {
  waiting_approval: 0,
  waiting_human: 0,
  failed: 1,
  running: 2,
  queued: 3,
  pending: 4,
  completed: 5,
  skipped: 6,
}

function buildRuntimeBranchSummary(
  branchIds: string[],
  nodeStates: Record<string, NodeState>,
  runtimeMeta: WorkflowRuntimeMeta,
): RuntimeBranchSummary | null {
  if (branchIds.length === 0) return null

  let running = 0
  let completed = 0
  let failed = 0
  let waitingApproval = 0
  let pending = 0

  for (const branchId of branchIds) {
    const status = nodeStates[branchId]?.status || "pending"
    if (status === "running") running += 1
    else if (status === "waiting_approval" || status === "waiting_human")
      waitingApproval += 1
    else if (status === "failed") failed += 1
    else if (status === "completed" || status === "skipped") completed += 1
    else pending += 1
  }

  const previews = branchIds
    .map((branchId) => ({
      id: branchId,
      label: runtimeMeta[branchId]?.subtaskKey
        ? getRuntimeBranchLabel(runtimeMeta[branchId].subtaskKey)
        : branchId.split("::").pop() || branchId,
      detail: getRuntimeBranchDetail(runtimeMeta[branchId]),
      status: nodeStates[branchId]?.status || "pending",
    }))
    .sort((left, right) => {
      const priorityDelta =
        (STATUS_PRIORITY[left.status] ?? 99) -
        (STATUS_PRIORITY[right.status] ?? 99)
      if (priorityDelta !== 0) return priorityDelta
      return left.label.localeCompare(right.label)
    })
    .slice(0, 4)

  return {
    total: branchIds.length,
    running,
    completed,
    failed,
    waitingApproval,
    pending,
    previews,
  }
}

function buildAggregateBranchState(
  branchIds: string[],
  summary: RuntimeBranchSummary,
  nodeStates: Record<string, NodeState>,
): NodeState {
  const status =
    summary.waitingApproval > 0
      ? "waiting_human"
      : summary.failed > 0
        ? "failed"
        : summary.running > 0
          ? "running"
          : summary.completed === summary.total && summary.total > 0
            ? "completed"
            : summary.completed > 0
              ? "running"
              : "pending"

  let totalTokensIn = 0
  let totalTokensOut = 0
  let totalCostUsd = 0
  let totalLatencyMs = 0
  let sawMetrics = false
  let startedAt: number | undefined
  let completedAt: number | undefined
  let error: string | undefined

  for (const branchId of branchIds) {
    const state = nodeStates[branchId]
    if (!state) continue
    if (!error && state.error) {
      error = state.error
    }
    if (typeof state.startedAt === "number") {
      startedAt =
        typeof startedAt === "number"
          ? Math.min(startedAt, state.startedAt)
          : state.startedAt
    }
    if (typeof state.completedAt === "number") {
      completedAt =
        typeof completedAt === "number"
          ? Math.max(completedAt, state.completedAt)
          : state.completedAt
    }
    if (state.metrics) {
      sawMetrics = true
      totalTokensIn += state.metrics.tokens_in || 0
      totalTokensOut += state.metrics.tokens_out || 0
      totalCostUsd += state.metrics.cost_usd || 0
      totalLatencyMs += state.metrics.latency_ms || 0
    }
  }

  return {
    status,
    attempts: 0,
    error,
    log: [],
    startedAt,
    completedAt,
    metrics: sawMetrics
      ? {
          tokens_in: totalTokensIn,
          tokens_out: totalTokensOut,
          cost_usd: totalCostUsd,
          latency_ms: totalLatencyMs,
        }
      : undefined,
  }
}

type UseChainBuilderRuntimeStateParams = {
  workflowNodes: WorkflowNode[]
  nodeStates: Record<string, NodeState>
  runtimeMeta: WorkflowRuntimeMeta
  reviewSnapshot: PersistedRunSnapshot | null
  runtimeMode: boolean
  flowCardMode: boolean
  activeNodeId: string | null
  selectedNodeId: string | null
}

export function useChainBuilderRuntimeState({
  workflowNodes,
  nodeStates,
  runtimeMeta,
  reviewSnapshot,
  runtimeMode,
  flowCardMode,
  activeNodeId,
  selectedNodeId,
}: UseChainBuilderRuntimeStateParams) {
  const displayNodeStates = reviewSnapshot?.nodeStates ?? nodeStates
  const displayRuntimeMeta = reviewSnapshot?.runtimeMeta ?? runtimeMeta

  const runtimeBranchIds = useMemo(
    () => Object.keys(displayRuntimeMeta || {}),
    [displayRuntimeMeta],
  )

  const branchIdsByTemplate = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const [branchId, meta] of Object.entries(displayRuntimeMeta || {})) {
      if (!meta?.templateId) continue
      const existing = map.get(meta.templateId)
      if (existing) existing.push(branchId)
      else map.set(meta.templateId, [branchId])
    }
    return map
  }, [displayRuntimeMeta])

  const runtimeBranchSummariesByTemplate = useMemo(() => {
    const summaries = new Map<string, RuntimeBranchSummary>()
    for (const [templateId, branchIds] of branchIdsByTemplate.entries()) {
      const summary = buildRuntimeBranchSummary(
        branchIds,
        displayNodeStates,
        displayRuntimeMeta || {},
      )
      if (summary) summaries.set(templateId, summary)
    }
    return summaries
  }, [branchIdsByTemplate, displayNodeStates, displayRuntimeMeta])

  const aggregateBranchStatesByTemplate = useMemo(() => {
    const aggregateStates = new Map<string, NodeState>()
    for (const [
      templateId,
      summary,
    ] of runtimeBranchSummariesByTemplate.entries()) {
      const branchIds = branchIdsByTemplate.get(templateId)
      if (!branchIds || branchIds.length === 0) continue
      aggregateStates.set(
        templateId,
        buildAggregateBranchState(branchIds, summary, displayNodeStates),
      )
    }
    return aggregateStates
  }, [branchIdsByTemplate, displayNodeStates, runtimeBranchSummariesByTemplate])

  const singleSplitterBranchSummary = useMemo(() => {
    const splitterCount = workflowNodes.filter(
      (node) => node.type === "splitter",
    ).length
    if (splitterCount !== 1) return null
    return buildRuntimeBranchSummary(
      runtimeBranchIds,
      displayNodeStates,
      displayRuntimeMeta || {},
    )
  }, [displayNodeStates, displayRuntimeMeta, runtimeBranchIds, workflowNodes])

  const resolvedActiveNodeId =
    activeNodeId && displayRuntimeMeta[activeNodeId]?.templateId
      ? displayRuntimeMeta[activeNodeId].templateId
      : activeNodeId

  const resolvedSelectedNodeId =
    selectedNodeId && displayRuntimeMeta[selectedNodeId]?.templateId
      ? displayRuntimeMeta[selectedNodeId].templateId
      : selectedNodeId

  const getNodePresentation = (node: WorkflowNode) => {
    const directState = displayNodeStates[node.id]
    const aggregateState = aggregateBranchStatesByTemplate.get(node.id)
    const effectiveState = flowCardMode
      ? aggregateState &&
        (!directState ||
          directState.status === "pending" ||
          directState.status === "queued")
        ? aggregateState
        : directState
      : directState
    const runtimeBranchSummary = flowCardMode
      ? node.type === "splitter"
        ? singleSplitterBranchSummary
        : (runtimeBranchSummariesByTemplate.get(node.id) ?? null)
      : null

    return { effectiveState, runtimeBranchSummary }
  }

  const orderedMonitorStages = useMemo(() => {
    if (!runtimeMode) return []
    return workflowNodes.map((node) => {
      const presentation = getNodePresentation(node)
      return {
        node,
        status: presentation.effectiveState?.status || "pending",
      }
    })
  }, [
    workflowNodes,
    runtimeMode,
    aggregateBranchStatesByTemplate,
    displayNodeStates,
    runtimeBranchSummariesByTemplate,
    singleSplitterBranchSummary,
  ])

  const monitorCurrentStage = useMemo(() => {
    if (!runtimeMode) return null
    return (
      orderedMonitorStages.find(
        (entry) =>
          entry.status === "running" ||
          entry.status === "waiting_approval" ||
          entry.status === "waiting_human" ||
          entry.status === "failed",
      ) || null
    )
  }, [orderedMonitorStages, runtimeMode])

  const monitorNextStage = useMemo(() => {
    if (!runtimeMode) return null
    return (
      orderedMonitorStages.find(
        (entry) => entry.status === "queued" || entry.status === "pending",
      ) || null
    )
  }, [orderedMonitorStages, runtimeMode])

  const monitorLatestCompletedStage = useMemo(() => {
    if (!runtimeMode) return null
    return (
      [...orderedMonitorStages]
        .reverse()
        .find(
          (entry) => entry.status === "completed" || entry.status === "skipped",
        ) || null
    )
  }, [orderedMonitorStages, runtimeMode])

  const monitorFocusNodeId = useMemo(() => {
    if (!runtimeMode) return null
    return (
      monitorCurrentStage?.node.id ||
      monitorNextStage?.node.id ||
      monitorLatestCompletedStage?.node.id ||
      null
    )
  }, [
    monitorCurrentStage,
    monitorLatestCompletedStage,
    monitorNextStage,
    runtimeMode,
  ])

  const monitorCounts = useMemo(() => {
    if (!runtimeMode) {
      return { completed: 0, pending: 0, blocked: 0 }
    }
    let completed = 0
    let pending = 0
    let blocked = 0
    for (const entry of orderedMonitorStages) {
      if (entry.status === "completed" || entry.status === "skipped")
        completed += 1
      else if (entry.status === "pending" || entry.status === "queued")
        pending += 1
      else if (
        entry.status === "failed" ||
        entry.status === "waiting_approval" ||
        entry.status === "waiting_human"
      )
        blocked += 1
    }
    return { completed, pending, blocked }
  }, [orderedMonitorStages, runtimeMode])

  return {
    displayNodeStates,
    displayRuntimeMeta,
    runtimeBranchSummariesByTemplate,
    singleSplitterBranchSummary,
    resolvedActiveNodeId,
    resolvedSelectedNodeId,
    getNodePresentation,
    orderedMonitorStages,
    monitorCurrentStage,
    monitorNextStage,
    monitorLatestCompletedStage,
    monitorFocusNodeId,
    monitorCounts,
  }
}
