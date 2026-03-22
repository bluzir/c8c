import {
  getRuntimeBranchDetail,
  getRuntimeBranchLabel,
  getRuntimeNodeLabel,
  getRuntimeStagePresentation,
} from "@/lib/runtime-flow-labels"
import { deriveExecutionLoopSummary } from "@/lib/execution-loops"
import {
  deriveTemplateContinuationDescription,
  deriveTemplateContinuationLabel,
  deriveTemplateDisplayLabel,
  deriveTemplateJobLabel,
} from "@/lib/workflow-entry"
import { isRunInFlight } from "@/lib/workflow-execution"
import { selectStageRerunNodeId } from "@/lib/workflow-rerun-target"
import { templateAutoRunsOnContinue, templateRequiresStartApproval } from "@/lib/stage-run-policy"
import { formatCost } from "@/components/output/outputFormatters"
import type {
  ArtifactRecord,
  EvaluationResult,
  LoadedRunResult,
  NodeState,
  RunStatus,
  RunResult,
  Workflow,
  WorkflowRuntimeMeta,
  WorkflowTemplate,
} from "@shared/types"

function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}

const OUTPUT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Needs attention",
  skipped: "Skipped",
  waiting_approval: "Waiting for approval",
  waiting_human: "Waiting for input",
}

function formatOutputStatusLabel(status: string | null) {
  if (!status) return "Pending"
  return OUTPUT_STATUS_LABELS[status] || status.replace(/_/g, " ")
}

function formatRunCompletedAt(run: RunResult): string {
  if (!Number.isFinite(run.completedAt) || run.completedAt <= 0) {
    return "n/a"
  }
  const completedDate = new Date(run.completedAt)
  if (Number.isNaN(completedDate.getTime())) {
    return "n/a"
  }
  return completedDate.toLocaleString()
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`
  const seconds = durationMs / 1_000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainSeconds}s`
}

function formatDateShort(timestamp: number): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return "n/a"
  return d.toLocaleDateString("en-CA") // YYYY-MM-DD
}

function compactLine(items: Array<string | null | undefined>) {
  return items.filter((item): item is string => Boolean(item && item.trim())).join(" · ")
}

function firstMeaningfulLine(value: string | null | undefined) {
  if (!value) return null
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) || null
}

function formatBranchScopeSummary(summary: OutputPanelBranchSummary) {
  const lead = summary.running > 0
    ? `${summary.running}/${summary.total} active`
    : summary.waitingApproval > 0
      ? `${summary.waitingApproval}/${summary.total} blocked`
      : summary.completed > 0
        ? `${summary.completed}/${summary.total} done`
        : `${summary.total} branches`

  return compactLine([
    lead,
    summary.failed > 0 ? `${summary.failed} failed` : null,
  ])
}

function derivePrimaryModel(nodeStates: Record<string, NodeState>): string | null {
  const modelCounts = new Map<string, number>()
  for (const state of Object.values(nodeStates)) {
    const modelId = state.meta?.model_id
    if (modelId) {
      modelCounts.set(modelId, (modelCounts.get(modelId) || 0) + 1)
    }
  }
  if (modelCounts.size === 0) return null
  let best = ""
  let bestCount = 0
  for (const [model, count] of modelCounts) {
    if (count > bestCount) {
      best = model
      bestCount = count
    }
  }
  return best
}

const BRANCH_STATUS_PRIORITY: Record<string, number> = {
  waiting_approval: 0,
  waiting_human: 0,
  failed: 1,
  running: 2,
  queued: 3,
  pending: 4,
  completed: 5,
  skipped: 6,
}

type OutputPanelBranchPreview = {
  id: string
  label: string
  detail?: string | null
  status: string
}

type OutputPanelBranchSummary = {
  total: number
  running: number
  completed: number
  failed: number
  waitingApproval: number
  pending: number
  previews: OutputPanelBranchPreview[]
}

function buildOutputPanelBranchSummary(
  branchIds: string[],
  nodeStates: Record<string, NodeState>,
  runtimeMeta: WorkflowRuntimeMeta,
): OutputPanelBranchSummary | null {
  if (branchIds.length === 0) return null

  let running = 0
  let completed = 0
  let failed = 0
  let waitingApproval = 0
  let pending = 0

  for (const branchId of branchIds) {
    const status = nodeStates[branchId]?.status || "pending"
    if (status === "running") running += 1
    else if (status === "waiting_approval" || status === "waiting_human") waitingApproval += 1
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
      const priorityDelta = (BRANCH_STATUS_PRIORITY[left.status] ?? 99) - (BRANCH_STATUS_PRIORITY[right.status] ?? 99)
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

type UseOutputPanelDerivedStateParams = {
  runStatus: string
  runOutcome: RunStatus | null
  runStartedAt: number | null
  completedAt: number | null
  executionWorkflowName: string
  nodeStates: Record<string, NodeState>
  activeNodeId: string | null
  inspectedNodeId: string | null
  finalContent: string
  workflow: Workflow
  evalResults: Record<string, EvaluationResult[]>
  runtimeMeta: WorkflowRuntimeMeta
  pastRuns: RunResult[]
  reviewedRun: RunResult | null
  reviewedRunDetails: LoadedRunResult | null
  reviewingPastRun: boolean
  artifactRecords: ArtifactRecord[]
  artifactPersistenceStatus: string
  artifactPersistenceError: string | null
  workspace: string | null
  onStartNewRun?: (() => void) | undefined
  onContinueRun?: ((run: RunResult) => Promise<void> | void) | undefined
  onRerunFrom?: ((nodeId: string, options?: { workspace?: string | null }) => Promise<void> | void) | undefined
  nextStageTemplate?: WorkflowTemplate | null
  nextStageArtifacts?: ArtifactRecord[]
  nextStagePending?: boolean
}

export function useOutputPanelDerivedState({
  runStatus,
  runOutcome,
  runStartedAt,
  completedAt,
  executionWorkflowName,
  nodeStates,
  activeNodeId,
  inspectedNodeId,
  finalContent,
  workflow,
  evalResults,
  runtimeMeta,
  pastRuns,
  reviewedRun,
  reviewedRunDetails,
  reviewingPastRun,
  artifactRecords,
  artifactPersistenceStatus,
  artifactPersistenceError,
  workspace,
  onStartNewRun,
  onContinueRun,
  onRerunFrom,
  nextStageTemplate = null,
  nextStageArtifacts = [],
  nextStagePending = false,
}: UseOutputPanelDerivedStateParams) {
  const latestPastRun = pastRuns[0] || null
  const selectedReviewRun = reviewedRun || latestPastRun
  const rerunWorkspace = reviewingPastRun ? selectedReviewRun?.workspace || null : workspace

  const reviewingRunHistory = reviewingPastRun && runStatus === "idle" && !!selectedReviewRun
  const reviewSnapshot = reviewingRunHistory ? reviewedRunDetails?.snapshot || null : null
  const reviewHumanTasks = reviewingRunHistory ? Object.values(reviewSnapshot?.humanTasks || {}) : []
  const openReviewTaskCount = reviewHumanTasks.filter((task) => task.status === "open").length
  const displayNodeStates = reviewingRunHistory ? (reviewSnapshot?.nodeStates || {}) : nodeStates
  const displayRuntimeMeta = reviewingRunHistory ? (reviewSnapshot?.runtimeMeta || {}) : runtimeMeta
  const displayEvalResults = reviewingRunHistory ? (reviewSnapshot?.evalResults || {}) : evalResults

  const replacedTemplateIds = new Set(
    Object.values(displayRuntimeMeta).map((meta) => meta.templateId).filter(Boolean),
  )

  const displayNodes = workflow.nodes
    .filter((node) => node.type !== "input" && node.type !== "output")
    .filter((node) => !replacedTemplateIds.has(node.id))
    .map((node) => ({
      id: node.id,
      label: getRuntimeNodeLabel(node, { fallbackId: node.id }),
      type: node.type,
    }))

  const staticNodeIds = new Set(workflow.nodes.map((node) => node.id))
  const runtimeBranchIds = Object.keys(displayNodeStates)
    .filter((id) => id.includes("::") && !staticNodeIds.has(id))

  const templateById = new Map(workflow.nodes.map((node) => [node.id, node]))
  const templateLabelByBranchId = new Map<string, string>()
  const templateLabelCounts = new Map<string, number>()

  for (const branchId of runtimeBranchIds) {
    const meta = displayRuntimeMeta[branchId]
    if (!meta) continue
    const templateNode = templateById.get(meta.templateId)
    const templateLabel = templateNode
      ? getRuntimeNodeLabel(templateNode, { fallbackId: templateNode.id })
      : meta.templateId
    templateLabelByBranchId.set(branchId, templateLabel)
    templateLabelCounts.set(templateLabel, (templateLabelCounts.get(templateLabel) || 0) + 1)
  }

  const runtimeBranchNodes = runtimeBranchIds.map((id) => {
    const meta = displayRuntimeMeta[id]
    if (!meta) {
      return { id, label: `branch: ${id.split("::").pop()}`, type: "skill" as const, indent: true }
    }

    const templateLabel = templateLabelByBranchId.get(id)
    const shouldDisambiguateTemplate = !!templateLabel && (templateLabelCounts.get(templateLabel) || 0) > 1
    const templateSuffix = templateLabel
      ? shouldDisambiguateTemplate
        ? `${templateLabel} · branch ${meta.branchIndex + 1}`
        : templateLabel
      : meta.templateId

    return {
      id,
      label: `branch: ${getRuntimeBranchLabel(meta.subtaskKey)} (${meta.branchIndex + 1}/${meta.totalBranches}) · ${templateSuffix}`,
      type: "skill" as const,
      indent: true,
    }
  })

  const allDisplayNodes = [...displayNodes, ...runtimeBranchNodes]
  const stageBranchSummaryById = new Map(
    displayNodes.map((node) => {
      const branchIds = node.type === "splitter"
        ? runtimeBranchIds
        : runtimeBranchIds.filter((id) => displayRuntimeMeta[id]?.templateId === node.id)
      return [node.id, buildOutputPanelBranchSummary(branchIds, displayNodeStates, displayRuntimeMeta)]
    }),
  )
  const stageStatusById = new Map(
    displayNodes.map((node) => {
      const directStatus = displayNodeStates[node.id]?.status || "pending"
      const branchSummary = stageBranchSummaryById.get(node.id)
      const effectiveStatus = branchSummary
        && (directStatus === "pending" || directStatus === "queued")
        ? branchSummary.waitingApproval > 0
          ? "waiting_human"
          : branchSummary.failed > 0
            ? "failed"
            : branchSummary.running > 0
              ? "running"
              : branchSummary.completed === branchSummary.total && branchSummary.total > 0
                ? "completed"
                : branchSummary.completed > 0
                  ? "running"
                  : directStatus
        : directStatus
      return [node.id, effectiveStatus]
    }),
  )
  const inspectableNodeIds = new Set([
    ...allDisplayNodes.map((node) => node.id),
    ...Object.keys(displayNodeStates),
  ])
  const selectedNodeId = inspectedNodeId && inspectableNodeIds.has(inspectedNodeId)
    ? inspectedNodeId
    : null
  const displayActiveNodeId = reviewingRunHistory ? selectedNodeId : activeNodeId
  const defaultReviewStageId = reviewingRunHistory
    ? displayNodes.find((node) => stageStatusById.get(node.id) === "failed")?.id
      || displayNodes.find((node) => {
        const status = stageStatusById.get(node.id)
        return status === "waiting_approval" || status === "waiting_human"
      })?.id
      || displayNodes.find((node) => stageStatusById.get(node.id) === "running")?.id
      || [...displayNodes].reverse().find((node) => {
        const status = stageStatusById.get(node.id)
        return status === "completed" || status === "skipped"
      })?.id
      || displayNodes[0]?.id
      || null
    : null
  const fallbackStageFocusId = selectedNodeId || displayActiveNodeId || defaultReviewStageId
  const displayLabelByNodeId = new Map(allDisplayNodes.map((node) => [node.id, node.label]))
  for (const node of workflow.nodes) {
    if (!displayLabelByNodeId.has(node.id)) {
      displayLabelByNodeId.set(node.id, getRuntimeNodeLabel(node, { fallbackId: node.id }))
    }
  }

  const workflowOrderIndex = new Map(workflow.nodes.map((node, index) => [node.id, index]))
  const rawResultNodeOptions = Object.entries(displayNodeStates)
    .filter(([, state]) => typeof state.output?.content === "string")
    .map(([id]) => {
      const workflowNode = templateById.get(id)
      const label = workflowNode?.type === "output"
        ? `${displayLabelByNodeId.get(id) || id} (final)`
        : (displayLabelByNodeId.get(id) || id)
      return {
        id,
        label,
        hasContent: (displayNodeStates[id]?.output?.content || "").trim().length > 0,
      }
    })
    .sort((a, b) => {
      const aIndex = workflowOrderIndex.get(a.id)
      const bIndex = workflowOrderIndex.get(b.id)
      if (aIndex != null && bIndex != null) return aIndex - bIndex
      if (aIndex != null) return -1
      if (bIndex != null) return 1
      return a.label.localeCompare(b.label)
    })
  const resultNodeOptions = rawResultNodeOptions.some((option) => templateById.get(option.id)?.type !== "input")
    ? rawResultNodeOptions.filter((option) => templateById.get(option.id)?.type !== "input")
    : rawResultNodeOptions
  const resultNodeOptionIds = new Set(resultNodeOptions.map((option) => option.id))

  const totalBranches = runtimeBranchNodes.length
  const completedBranches = runtimeBranchNodes.filter((node) => {
    const status = displayNodeStates[node.id]?.status
    return status === "completed" || status === "failed" || status === "skipped"
  }).length
  const branchesProgressPct = totalBranches > 0
    ? Math.round((completedBranches / totalBranches) * 100)
    : 0

  const budgetCost = workflow.defaults?.budget_cost_usd ?? null
  const budgetTokens = workflow.defaults?.budget_tokens ?? null
  const accumulatedCost = Object.values(displayNodeStates).reduce(
    (sum, state) => sum + (state.metrics?.cost_usd || 0),
    0,
  )
  const totalTokensIn = Object.values(displayNodeStates).reduce(
    (sum, state) => sum + (state.metrics?.tokens_in || 0),
    0,
  )
  const totalTokensOut = Object.values(displayNodeStates).reduce(
    (sum, state) => sum + (state.metrics?.tokens_out || 0),
    0,
  )
  const totalTokens = totalTokensIn + totalTokensOut
  const budgetProgressRatio = budgetCost && budgetCost > 0 ? accumulatedCost / budgetCost : 1
  const budgetWarning = budgetCost == null
    ? null
    : budgetProgressRatio >= 1
      ? "Budget exceeded. Execution may stop on the next budget check."
      : budgetProgressRatio >= 0.9
        ? "Budget warning: over 90% of cost limit is used."
        : budgetProgressRatio >= 0.7
          ? "Budget notice: over 70% of cost limit is used."
          : null

  const historicalResultContent = reviewedRunDetails?.reportContent || ""
  const hasNodeStates = Object.keys(displayNodeStates).length > 0
  const hasFinalResult = finalContent.trim().length > 0
  const hasStageResult = resultNodeOptions.length > 0
  const hasLiveResult = hasFinalResult || hasStageResult
  const hasHistoricalResult = reviewingRunHistory && !!selectedReviewRun
  const hasResult = hasLiveResult || hasHistoricalResult
  const outputResultNode = resultNodeOptions.find((option) => templateById.get(option.id)?.type === "output") || null
  const failureLikeRun = reviewingRunHistory
    ? selectedReviewRun?.status === "failed" || selectedReviewRun?.status === "interrupted"
    : runStatus === "error" || runOutcome === "failed" || runOutcome === "interrupted"
  const selectedResultNodeId = selectedNodeId && resultNodeOptionIds.has(selectedNodeId)
    ? selectedNodeId
    : failureLikeRun && fallbackStageFocusId
      ? fallbackStageFocusId
      : outputResultNode?.id || resultNodeOptions[0]?.id || null
  const selectedResultOutput = selectedResultNodeId ? displayNodeStates[selectedResultNodeId]?.output : undefined
  const selectedResultMeta = selectedResultNodeId ? displayRuntimeMeta[selectedResultNodeId] : undefined
  const selectedResultWorkflowNode = selectedResultNodeId
    ? templateById.get(selectedResultMeta?.templateId || selectedResultNodeId) || null
    : null
  const selectedResultPresentation = selectedResultWorkflowNode
    ? getRuntimeStagePresentation(selectedResultWorkflowNode, {
      fallbackId: selectedResultNodeId || undefined,
      output: selectedResultOutput,
    })
    : null
  const selectedResultBranchLabel = selectedResultMeta
    ? getRuntimeBranchLabel(selectedResultMeta.subtaskKey)
    : null
  const selectedResultSplitterPresentation = selectedResultMeta?.splitterId
    ? (() => {
        const splitterNode = templateById.get(selectedResultMeta.splitterId)
        return splitterNode ? getRuntimeStagePresentation(splitterNode, { fallbackId: splitterNode.id }) : null
      })()
    : null
  const selectedResultMetrics = selectedResultNodeId
    ? displayNodeStates[selectedResultNodeId]?.metrics
    : undefined
  const selectedResultMetricItems = selectedResultMetrics
    ? [
        selectedResultMetrics.tokens_in > 0 ? `${formatTokenCount(selectedResultMetrics.tokens_in)} in` : null,
        selectedResultMetrics.tokens_out > 0 ? `${formatTokenCount(selectedResultMetrics.tokens_out)} out` : null,
        selectedResultMetrics.cost_usd > 0 ? formatCost(selectedResultMetrics.cost_usd) : null,
      ].filter(Boolean) as string[]
    : []
  const selectedResultMetricsLabel = selectedResultMetricItems.join(" · ")
  const selectedResultContent = selectedResultNodeId
    ? (displayNodeStates[selectedResultNodeId]?.output?.content || "")
    : null
  const displayedResultContent = reviewingRunHistory
    ? historicalResultContent
    : (selectedResultContent ?? finalContent)
  const isDisplayedResultEmpty = displayedResultContent.trim().length === 0
  const canCopyResult = displayedResultContent.length > 0
  const hasMultipleResultOptions = resultNodeOptions.length > 1
  const showIdleState = runStatus === "idle" && !hasNodeStates && !hasLiveResult && !reviewingRunHistory

  const selectedStageId = fallbackStageFocusId
  const selectedStageMeta = selectedStageId ? displayRuntimeMeta[selectedStageId] : undefined
  const selectedStageWorkflowNode = selectedStageId
    ? templateById.get(selectedStageMeta?.templateId || selectedStageId) || null
    : null
  const selectedStageBranchIds = selectedStageId
    ? selectedStageMeta?.templateId
      ? runtimeBranchIds.filter((id) => displayRuntimeMeta[id]?.templateId === selectedStageMeta.templateId)
      : selectedStageWorkflowNode?.type === "splitter"
        ? runtimeBranchIds
        : runtimeBranchIds.filter((id) => displayRuntimeMeta[id]?.templateId === selectedStageId)
    : []
  const selectedStageRerunNodeId = selectStageRerunNodeId({
    stageNodeId: selectedStageWorkflowNode?.id || null,
    stageNodeType: selectedStageWorkflowNode?.type || null,
    stageTemplateId: selectedStageMeta?.templateId || null,
    runtimeBranchIds,
    runtimeMeta: displayRuntimeMeta,
    nodeStates: displayNodeStates,
  })
  const selectedStageOutput = selectedStageId ? displayNodeStates[selectedStageId]?.output : undefined
  const selectedStagePresentation = selectedStageWorkflowNode
    ? getRuntimeStagePresentation(selectedStageWorkflowNode, {
      fallbackId: selectedStageId || undefined,
      output: selectedStageOutput,
    })
    : null
  const selectedStageBranchLabel = selectedStageMeta
    ? getRuntimeBranchLabel(selectedStageMeta.subtaskKey)
    : null
  const selectedStageDirectStatus = selectedStageId ? (displayNodeStates[selectedStageId]?.status || "pending") : null
  const selectedStageIndex = selectedStageId
    ? (() => {
        const index = allDisplayNodes.findIndex((node) => node.id === selectedStageId)
        return index >= 0 ? index + 1 : null
      })()
    : null
  const workflowStepCount = allDisplayNodes.length
  const completedStageCount = allDisplayNodes.filter((node) => {
    const status = displayNodeStates[node.id]?.status
    return status === "completed" || status === "skipped"
  }).length
  const runningStageCount = allDisplayNodes.filter((node) => displayNodeStates[node.id]?.status === "running").length
  const blockedStageCount = allDisplayNodes.filter((node) => {
    const status = displayNodeStates[node.id]?.status
    return status === "waiting_approval" || status === "waiting_human"
  }).length
  const pendingStageCount = allDisplayNodes.filter((node) => {
    const status = displayNodeStates[node.id]?.status || "pending"
    return status === "pending" || status === "queued"
  }).length
  const failedStageCount = allDisplayNodes.filter((node) => displayNodeStates[node.id]?.status === "failed").length
  const selectedStageBranchSummary = buildOutputPanelBranchSummary(
    selectedStageBranchIds,
    displayNodeStates,
    displayRuntimeMeta,
  )
  const selectedStageStatus = selectedStageBranchSummary
    && !selectedStageBranchLabel
    && (selectedStageDirectStatus === "pending" || selectedStageDirectStatus === "queued")
    ? selectedStageBranchSummary.waitingApproval > 0
      ? "waiting_human"
      : selectedStageBranchSummary.failed > 0
        ? "failed"
        : selectedStageBranchSummary.running > 0
          ? "running"
          : selectedStageBranchSummary.completed === selectedStageBranchSummary.total && selectedStageBranchSummary.total > 0
            ? "completed"
            : selectedStageBranchSummary.completed > 0
              ? "running"
              : selectedStageDirectStatus
    : selectedStageDirectStatus
  const selectedStageBranchDetail = selectedStageStatus === "failed"
    ? (() => {
        const directError = selectedStageId
          ? firstMeaningfulLine(displayNodeStates[selectedStageId]?.error)
          : null
        if (directError) return directError

        const failedBranchId = selectedStageBranchIds.find((branchId) =>
          displayNodeStates[branchId]?.status === "failed" && displayNodeStates[branchId]?.error,
        )
        if (failedBranchId) {
          const branchLabel = displayRuntimeMeta[failedBranchId]?.subtaskKey
            ? getRuntimeBranchLabel(displayRuntimeMeta[failedBranchId].subtaskKey)
            : failedBranchId.split("::").pop() || failedBranchId
          const branchError = firstMeaningfulLine(displayNodeStates[failedBranchId]?.error)
          return branchError ? `${branchLabel}: ${branchError}` : branchLabel
        }

        return selectedStageMeta
          ? getRuntimeBranchDetail(selectedStageMeta)
          : null
      })()
    : selectedStageMeta
      ? getRuntimeBranchDetail(selectedStageMeta)
      : null
  const selectedStageSplitterPresentation = selectedStageMeta?.splitterId
    ? (() => {
        const splitterNode = templateById.get(selectedStageMeta.splitterId)
        return splitterNode ? getRuntimeStagePresentation(splitterNode, { fallbackId: splitterNode.id }) : null
      })()
    : null
  const selectedStageOwnsActiveWork = Boolean(
    selectedStageId === displayActiveNodeId
    || (
      !selectedStageBranchLabel
      && selectedStageBranchSummary
      && (
        selectedStageStatus === "running"
        || selectedStageStatus === "waiting_approval"
        || selectedStageStatus === "waiting_human"
        || selectedStageStatus === "failed"
      )
    ),
  )
  const selectedStageStatusLabel = formatOutputStatusLabel(selectedStageStatus)
  const nextStageId = allDisplayNodes.find((node) => {
    const status = displayNodeStates[node.id]?.status || "pending"
    return status === "queued" || status === "pending"
  })?.id || null
  const selectedStageContextLabel = selectedStageId
    ? selectedStageOwnsActiveWork
      ? selectedStageStatus === "failed"
        ? "Step needing attention"
        : selectedStageStatus === "running"
          ? "Current step"
          : "Blocked step"
      : !reviewingRunHistory && selectedStageId === nextStageId
        ? "Next step"
        : selectedStageStatus === "completed" || selectedStageStatus === "skipped"
          ? "Completed step"
          : "Selected step"
    : "Selected step"
  const selectedStageContextLabelClass = selectedStageOwnsActiveWork && selectedStageStatus === "running"
    ? "text-status-info"
    : selectedStageOwnsActiveWork && (selectedStageStatus === "waiting_approval" || selectedStageStatus === "waiting_human")
      ? "text-status-warning"
      : selectedStageStatus === "failed"
        ? "text-status-danger"
        : !reviewingRunHistory && selectedStageId === nextStageId
          ? "text-foreground"
          : selectedStageStatus === "completed" || selectedStageStatus === "skipped"
            ? "text-status-success"
            : "text-muted-foreground"
  const selectedStageScopeLabel = selectedStagePresentation
    ? selectedStageBranchLabel
      ? compactLine([
          `Viewing: ${selectedStageBranchLabel}`,
          selectedStageSplitterPresentation ? `Branch of ${selectedStageSplitterPresentation.title}` : "Branch run",
          selectedStageContextLabel === "Selected step" ? selectedStageStatusLabel : selectedStageContextLabel,
        ])
      : selectedStageBranchSummary
        ? compactLine([
            `Viewing: ${selectedStagePresentation.title}`,
            formatBranchScopeSummary(selectedStageBranchSummary),
            selectedStageContextLabel === "Selected step" ? selectedStageStatusLabel : selectedStageContextLabel,
          ])
        : compactLine([
            `Viewing: ${selectedStagePresentation.title}`,
            selectedStageContextLabel === "Selected step" ? selectedStageStatusLabel : selectedStageContextLabel,
          ])
    : compactLine([
        `Run: ${executionWorkflowName || workflow.name || "Flow"}`,
        workflowStepCount > 0 ? `${completedStageCount}/${workflowStepCount} done` : null,
      ])
  const selectedResultScopeLabel = selectedResultPresentation
    ? selectedResultBranchLabel
      ? compactLine([
          `Result from: ${selectedResultBranchLabel}`,
          selectedResultSplitterPresentation ? `Branch of ${selectedResultSplitterPresentation.title}` : "Branch run",
        ])
      : compactLine([
          `Result from: ${selectedResultPresentation.title}`,
          selectedResultPresentation.artifactRoleLabel === "Final"
            ? "Final output"
            : `${selectedResultPresentation.artifactRoleLabel.toLowerCase()} output`,
        ])
    : `Result from: ${executionWorkflowName || workflow.name || "Flow"}`
  const selectedRunLabel = selectedReviewRun
    ? `${selectedReviewRun.workflowName || workflow.name || "Flow"} · ${formatRunCompletedAt(selectedReviewRun)}`
    : null
  const effectiveRunOutcome = reviewingRunHistory
    ? (selectedReviewRun?.status || null)
    : (runStatus === "error" && !runOutcome ? "failed" : runOutcome)
  const canInspectSavedRun = reviewingRunHistory && !!reviewSnapshot
  const showBlockedReviewStrip = reviewingRunHistory && selectedReviewRun?.status === "blocked"
  const canContinueBlockedReview = showBlockedReviewStrip
    && !!reviewSnapshot
    && openReviewTaskCount === 0
    && !!onContinueRun
    && !!selectedReviewRun
  const canStartFreshRun = Boolean(onStartNewRun)
    && !isRunInFlight(runStatus as any)
    && (reviewingRunHistory || runStatus === "done" || runStatus === "error" || pastRuns.length > 0)
  const canRerunStages = Boolean(onRerunFrom) && !isRunInFlight(runStatus as any) && !!rerunWorkspace
  const canRerunSelectedStage = Boolean(
    selectedStageRerunNodeId
    && canRerunStages
    && (selectedStageStatus === "completed" || selectedStageStatus === "failed"),
  )
  const showArtifactContinuation = !reviewingRunHistory && effectiveRunOutcome === "completed" && (
    artifactPersistenceStatus !== "idle"
    || artifactRecords.length > 0
    || Boolean(artifactPersistenceError)
    || Boolean(nextStageTemplate)
  )
  const showResultSurface = hasResult || (!reviewingRunHistory && (
    runStatus === "error"
    || (runStatus === "done" && effectiveRunOutcome !== "blocked")
  ))
  const failedNodeErrors = Object.entries(displayNodeStates)
    .filter(([, state]) => state.status === "failed" && state.error)
  const artifactContinuationToneClass = artifactPersistenceStatus === "error"
    ? "surface-danger-soft"
    : artifactPersistenceStatus === "saved"
      ? "surface-success-soft"
      : "surface-inset-card"
  const nextStageRequiresApproval = templateRequiresStartApproval(nextStageTemplate)
  const nextStageAutoRuns = templateAutoRunsOnContinue(nextStageTemplate)
  const nextStageLabel = nextStageTemplate
    ? (deriveTemplateContinuationLabel(nextStageTemplate) || deriveTemplateJobLabel(nextStageTemplate) || deriveTemplateDisplayLabel(nextStageTemplate) || nextStageTemplate.name)
    : null
  const nextStageDescription = nextStageTemplate
    ? deriveTemplateContinuationDescription(nextStageTemplate)
    : null
  const visibleArtifactContinuation = artifactRecords.slice(0, 4)
  const hiddenArtifactContinuationCount = Math.max(0, artifactRecords.length - visibleArtifactContinuation.length)
  const visibleNextStageArtifacts = nextStageArtifacts.slice(0, 4)
  const hiddenNextStageArtifactCount = Math.max(0, nextStageArtifacts.length - visibleNextStageArtifacts.length)

  const executionLoopSummary = deriveExecutionLoopSummary({
    workflow,
    nodeStates: displayNodeStates,
    evalResults: displayEvalResults,
    runOutcome: effectiveRunOutcome,
  })
  const approvalLoopSummary = executionLoopSummary?.outcome === "human decision"
    ? executionLoopSummary
    : null
  // Build copy text with meta-header for sharing
  const resultCopyTextWithHeader = (() => {
    if (isDisplayedResultEmpty) return displayedResultContent

    const flowName = reviewingRunHistory
      ? (selectedReviewRun?.workflowName || workflow.name || "Flow")
      : (executionWorkflowName || workflow.name || "Flow")

    const metaParts: string[] = []

    // Date
    const dateTimestamp = reviewingRunHistory
      ? selectedReviewRun?.completedAt
      : completedAt
    if (dateTimestamp && dateTimestamp > 0) {
      metaParts.push(`Date: ${formatDateShort(dateTimestamp)}`)
    }

    // Duration
    if (reviewingRunHistory && selectedReviewRun) {
      if (typeof selectedReviewRun.durationMs === "number" && selectedReviewRun.durationMs >= 0) {
        metaParts.push(`Duration: ${formatDurationMs(selectedReviewRun.durationMs)}`)
      } else if (selectedReviewRun.completedAt > 0 && selectedReviewRun.startedAt > 0) {
        const delta = selectedReviewRun.completedAt - selectedReviewRun.startedAt
        if (delta > 0) metaParts.push(`Duration: ${formatDurationMs(delta)}`)
      }
    } else if (completedAt && completedAt > 0 && runStartedAt && runStartedAt > 0) {
      const delta = completedAt - runStartedAt
      if (delta > 0) metaParts.push(`Duration: ${formatDurationMs(delta)}`)
    }

    // Cost
    const cost = reviewingRunHistory
      ? (selectedReviewRun?.totalCost ?? accumulatedCost)
      : accumulatedCost
    if (cost > 0) {
      metaParts.push(`Cost: ${formatCost(cost)}`)
    }

    // Model
    const model = derivePrimaryModel(displayNodeStates)
    if (model) {
      metaParts.push(`Model: ${model}`)
    }

    const metaLine = metaParts.join(" | ")
    const header = metaLine
      ? `# ${flowName} \u2014 Result\n${metaLine}\n\n---\n\n`
      : `# ${flowName} \u2014 Result\n\n---\n\n`

    return header + displayedResultContent
  })()

  return {
    latestPastRun,
    selectedReviewRun,
    rerunWorkspace,
    reviewingRunHistory,
    reviewSnapshot,
    openReviewTaskCount,
    displayNodeStates,
    displayRuntimeMeta,
    displayEvalResults,
    allDisplayNodes,
    selectedNodeId,
    displayActiveNodeId,
    templateById,
    resultNodeOptions,
    totalBranches,
    branchesProgressPct,
    budgetProgressRatio,
    budgetWarning,
    budgetWarningClassName: budgetProgressRatio >= 0.9 ? "text-status-danger" : "text-status-warning",
    hasResult,
    displayedResultContent,
    resultCopyTextWithHeader,
    isDisplayedResultEmpty,
    canCopyResult,
    hasMultipleResultOptions,
    showIdleState,
    selectedResultNodeId,
    selectedResultPresentation,
    selectedResultBranchLabel,
    selectedResultScopeLabel,
    selectedResultMetricsLabel,
    selectedStageId,
    selectedStageRerunNodeId,
    selectedStagePresentation,
    selectedStageBranchLabel,
    selectedStageBranchDetail,
    selectedStageBranchSummary,
    selectedStageScopeLabel,
    selectedStageStatus,
    selectedStageIndex,
    workflowStepCount,
    completedStageCount,
    runningStageCount,
    blockedStageCount,
    pendingStageCount,
    failedStageCount,
    selectedStageContextLabel,
    selectedStageContextLabelClass,
    selectedRunLabel,
    canInspectSavedRun,
    showBlockedReviewStrip,
    canContinueBlockedReview,
    canStartFreshRun,
    canRerunStages,
    canRerunSelectedStage,
    showResultSurface,
    showArtifactContinuation,
    failedNodeErrors,
    artifactContinuationToneClass,
    nextStageRequiresApproval,
    nextStageAutoRuns,
    nextStageLabel,
    nextStageDescription,
    visibleArtifactContinuation,
    hiddenArtifactContinuationCount,
    visibleNextStageArtifacts,
    hiddenNextStageArtifactCount,
    executionLoopSummary,
    approvalLoopSummary,
    effectiveRunOutcome,
  }
}
