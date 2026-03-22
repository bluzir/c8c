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
  const inspectableNodeIds = new Set([
    ...allDisplayNodes.map((node) => node.id),
    ...Object.keys(displayNodeStates),
  ])
  const selectedNodeId = inspectedNodeId && inspectableNodeIds.has(inspectedNodeId)
    ? inspectedNodeId
    : null
  const displayActiveNodeId = reviewingRunHistory ? selectedNodeId : activeNodeId
  const displayLabelByNodeId = new Map(allDisplayNodes.map((node) => [node.id, node.label]))
  for (const node of workflow.nodes) {
    if (!displayLabelByNodeId.has(node.id)) {
      displayLabelByNodeId.set(node.id, getRuntimeNodeLabel(node, { fallbackId: node.id }))
    }
  }

  const workflowOrderIndex = new Map(workflow.nodes.map((node, index) => [node.id, index]))
  const resultNodeOptions = Object.entries(displayNodeStates)
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
  const selectedResultNodeId = selectedNodeId && resultNodeOptionIds.has(selectedNodeId)
    ? selectedNodeId
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

  const defaultReviewStageId = reviewingRunHistory ? allDisplayNodes[0]?.id || null : null
  const selectedStageId = selectedNodeId || displayActiveNodeId || defaultReviewStageId
  const selectedStageMeta = selectedStageId ? displayRuntimeMeta[selectedStageId] : undefined
  const selectedStageWorkflowNode = selectedStageId
    ? templateById.get(selectedStageMeta?.templateId || selectedStageId) || null
    : null
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
  const selectedStageBranchDetail = selectedStageMeta
    ? getRuntimeBranchDetail(selectedStageMeta)
    : null
  const selectedStageStatus = selectedStageId ? (displayNodeStates[selectedStageId]?.status || "pending") : null
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
  const failedStageCount = allDisplayNodes.filter((node) => displayNodeStates[node.id]?.status === "failed").length
  const selectedStageHasOutput = selectedStageId
    ? typeof displayNodeStates[selectedStageId]?.output?.content === "string"
      && (displayNodeStates[selectedStageId]?.output?.content || "").trim().length > 0
    : false
  const selectedStageStatusLabel = formatOutputStatusLabel(selectedStageStatus)
  const nextStageId = allDisplayNodes.find((node) => {
    const status = displayNodeStates[node.id]?.status || "pending"
    return status === "queued" || status === "pending"
  })?.id || null
  const selectedStageContextLabel = selectedStageId
    ? selectedStageId === displayActiveNodeId && (
      selectedStageStatus === "running"
      || selectedStageStatus === "waiting_approval"
      || selectedStageStatus === "waiting_human"
      || selectedStageStatus === "failed"
    )
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
  const selectedStageContextToneClass = "bg-surface-2/60"
  const selectedStageContextLabelClass = selectedStageId === displayActiveNodeId && selectedStageStatus === "running"
    ? "text-status-info"
    : selectedStageId === displayActiveNodeId && (selectedStageStatus === "waiting_approval" || selectedStageStatus === "waiting_human")
      ? "text-status-warning"
      : selectedStageStatus === "failed"
        ? "text-status-danger"
        : !reviewingRunHistory && selectedStageId === nextStageId
          ? "text-foreground"
          : selectedStageStatus === "completed" || selectedStageStatus === "skipped"
            ? "text-status-success"
            : "text-muted-foreground"

  const activitySummaryItems = [
    `${formatCost(accumulatedCost)}${budgetCost != null ? ` / ${formatCost(budgetCost)}` : ""} cost`,
    `${formatTokenCount(totalTokens)} tokens${budgetTokens != null ? ` / ${formatTokenCount(budgetTokens)}` : ""}`,
    totalBranches > 0 ? `${branchesProgressPct}% branches ready` : null,
  ].filter(Boolean) as string[]
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
    selectedStageId
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
    selectedResultMetricsLabel,
    selectedStageId,
    selectedStagePresentation,
    selectedStageBranchLabel,
    selectedStageBranchDetail,
    selectedStageStatus,
    selectedStageIndex,
    selectedStageStatusLabel,
    workflowStepCount,
    completedStageCount,
    failedStageCount,
    selectedStageHasOutput,
    selectedStageContextLabel,
    selectedStageContextToneClass,
    selectedStageContextLabelClass,
    activitySummaryItems,
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
