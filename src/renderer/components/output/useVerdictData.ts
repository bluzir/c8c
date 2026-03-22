import type { ExecutionLoopSummary } from "@/lib/execution-loops"
import type { RuntimeStagePresentation } from "@/lib/runtime-flow-labels"
import { formatCost } from "@/components/output/outputFormatters"
import type { EvaluationResult, NodeState, RunResult } from "@shared/types"

type VerdictTerminalVariant = "saved" | "completed" | "failed" | "cancelled"
type VerdictTone = "neutral" | "warning" | "danger"
type VerdictSurfaceMode = "decision" | "document"
type VerdictVariant = "outcome" | "diagnostic" | "document"

export interface VerdictEvidencePanelItem {
  id: string
  scoreLabel: string
  detail: string
  tone: VerdictTone
}

export interface VerdictData {
  terminalVariant: VerdictTerminalVariant
  variant: VerdictVariant
  surfaceMode: VerdictSurfaceMode
  tone: VerdictTone
  headline: string
  provenanceLabel: string | null
  evidenceItems: string[]
  evidencePanelTitle: string | null
  evidencePanelItems: VerdictEvidencePanelItem[]
  followUpLabel: string | null
  preservedText: string | null
}

function formatDurationMs(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`
  const seconds = durationMs / 1_000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainSeconds}s`
}

function formatRunDuration(run: RunResult): string | null {
  if (typeof run.durationMs === "number" && run.durationMs >= 0) {
    return formatDurationMs(run.durationMs)
  }
  if (run.completedAt > 0 && run.startedAt > 0) {
    const delta = run.completedAt - run.startedAt
    if (delta > 0) return formatDurationMs(delta)
  }
  return null
}

function formatRunCompletedAt(run: RunResult): string | null {
  if (!Number.isFinite(run.completedAt) || run.completedAt <= 0) return null
  const completedDate = new Date(run.completedAt)
  if (Number.isNaN(completedDate.getTime())) return null
  return completedDate.toLocaleString()
}

function formatScore(score: number | null): string | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null
  const normalized = score % 1 === 0 ? score.toFixed(0) : score.toFixed(1)
  return `${normalized}/10`
}

function normalizeHeadline(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized || null
}

function firstLine(value: string | null | undefined) {
  if (!value) return null
  const line = value
    .split(/\r?\n/)
    .map((entry) => normalizeHeadline(entry))
    .find(Boolean)
  return line || null
}

function buildCompletedHeadline({
  resultState,
  latestEval,
  selectedResultPresentation,
  reviewingRunHistory,
  selectedReviewRun,
  isDisplayedResultEmpty,
}: {
  resultState: NodeState | null
  latestEval: EvaluationResult | null
  selectedResultPresentation: RuntimeStagePresentation | null
  reviewingRunHistory: boolean
  selectedReviewRun: RunResult | null
  isDisplayedResultEmpty: boolean
}) {
  const metadata = resultState?.output?.metadata
  const reasonHeadline = normalizeHeadline(metadata?.reason)
    || normalizeHeadline(latestEval?.reason)
  const artifactHeadline = normalizeHeadline(metadata?.artifact_label)
    || normalizeHeadline(selectedResultPresentation?.artifactLabel)
    || normalizeHeadline(selectedResultPresentation?.title)

  if (reviewingRunHistory) {
    if (selectedReviewRun?.status === "blocked") {
      return artifactHeadline
        || selectedReviewRun.workflowName
        || "Run waiting on approval"
    }
    return reasonHeadline
      || artifactHeadline
      || normalizeHeadline(selectedReviewRun?.workflowName)
      || "Saved result"
  }

  if (isDisplayedResultEmpty) {
    return selectedResultPresentation?.outcomeText || "No result yet. Results appear here when the flow completes."
  }

  if (reasonHeadline) {
      return reasonHeadline
  }

  if (artifactHeadline) {
    return artifactHeadline
  }

  return selectedResultPresentation?.outcomeText
    || "Latest result"
}

function buildProvenanceLabel({
  resultState,
  selectedResultPresentation,
  selectedResultBranchLabel,
  reviewingRunHistory,
  selectedReviewRun,
}: {
  resultState: NodeState | null
  selectedResultPresentation: RuntimeStagePresentation | null
  selectedResultBranchLabel: string | null
  reviewingRunHistory: boolean
  selectedReviewRun: RunResult | null
}) {
  const metadata = resultState?.output?.metadata
  const parts = [
    reviewingRunHistory && selectedReviewRun
      ? formatRunCompletedAt(selectedReviewRun)
      : null,
    reviewingRunHistory ? null : selectedResultBranchLabel,
  ].filter((value): value is string => Boolean(value))

  return parts.length > 0 ? parts.join(" · ") : null
}

export function deriveVerdictData({
  nodeStates,
  evalResults,
  selectedResultNodeId,
  selectedResultPresentation,
  selectedResultBranchLabel,
  selectedStagePresentation,
  selectedStageIndex,
  workflowStepCount,
  completedStageCount,
  failedStageCount,
  reviewingRunHistory,
  selectedReviewRun,
  executionLoopSummary,
  runStatus,
  runOutcome,
  hasPrimaryContinuation,
  isDisplayedResultEmpty,
  failedNodeErrors,
}: {
  nodeStates: Record<string, NodeState>
  evalResults: Record<string, EvaluationResult[]>
  selectedResultNodeId: string | null
  selectedResultPresentation: RuntimeStagePresentation | null
  selectedResultBranchLabel: string | null
  selectedStagePresentation: RuntimeStagePresentation | null
  selectedStageIndex: number | null
  workflowStepCount: number
  completedStageCount: number
  failedStageCount: number
  reviewingRunHistory: boolean
  selectedReviewRun: RunResult | null
  executionLoopSummary: ExecutionLoopSummary | null
  runStatus: string
  runOutcome: string | null
  hasPrimaryContinuation: boolean
  isDisplayedResultEmpty: boolean
  failedNodeErrors: Array<[string, { error?: string }]>
}): VerdictData {
  const resultState = selectedResultNodeId ? (nodeStates[selectedResultNodeId] || null) : null
  const latestEval = selectedResultNodeId
    ? (evalResults[selectedResultNodeId] || []).slice(-1)[0] || null
    : null
  const resultMetrics = resultState?.metrics
  const resultWarnings = resultState?.warnings || []
  const metadata = resultState?.output?.metadata
  const terminalVariant: VerdictTerminalVariant = reviewingRunHistory
    ? "saved"
    : runStatus === "error" || runOutcome === "failed" || runOutcome === "interrupted"
      ? "failed"
      : runOutcome === "cancelled"
        ? "cancelled"
        : "completed"

  const scoreValue = typeof metadata?.score === "number"
    ? metadata.score
    : typeof latestEval?.score === "number"
      ? latestEval.score
      : typeof executionLoopSummary?.score === "number"
        ? executionLoopSummary.score
        : null
  const failedCriteriaCount = executionLoopSummary?.failedCriteriaCount || 0
  const warningCount = resultWarnings.length + failedCriteriaCount
  const criticalCount = terminalVariant === "failed"
    ? Math.max(failedNodeErrors.length, failedStageCount > 0 ? 1 : 0)
    : 0
  const structuredCriteria = executionLoopSummary?.criteriaBreakdown
    || latestEval?.criteria
    || metadata?.criteria
    || []
  const fixInstructions = executionLoopSummary?.fixInstructions
    || latestEval?.fix_instructions
    || metadata?.fix_instructions
    || null
  const hasDiagnosticStructure = terminalVariant === "failed"
    || structuredCriteria.length > 0
    || Boolean(fixInstructions)

  const durationLabel = reviewingRunHistory && selectedReviewRun
    ? formatRunDuration(selectedReviewRun)
    : typeof resultMetrics?.latency_ms === "number" && resultMetrics.latency_ms > 0
      ? formatDurationMs(resultMetrics.latency_ms)
      : null
  const costLabel = typeof resultMetrics?.cost_usd === "number" && resultMetrics.cost_usd > 0
    ? formatCost(resultMetrics.cost_usd)
    : reviewingRunHistory && typeof selectedReviewRun?.totalCost === "number" && selectedReviewRun.totalCost > 0
      ? formatCost(selectedReviewRun.totalCost)
      : null

  const headline = terminalVariant === "failed"
    ? normalizeHeadline(metadata?.reason)
      || firstLine(latestEval?.reason)
      || firstLine(failedNodeErrors[0]?.[1]?.error)
      || `${selectedStagePresentation?.title || "Run"} failed before it could finish.`
    : terminalVariant === "cancelled"
      ? selectedStageIndex && workflowStepCount > 0
        ? `Run cancelled at step ${selectedStageIndex}/${workflowStepCount}.`
        : "The flow stopped before it finished."
      : buildCompletedHeadline({
        resultState,
        latestEval,
        selectedResultPresentation,
        reviewingRunHistory,
        selectedReviewRun,
        isDisplayedResultEmpty,
      })

  const evidenceItems = hasDiagnosticStructure
    ? [
        formatScore(scoreValue),
        structuredCriteria.length > 0
          ? `${structuredCriteria.length} check${structuredCriteria.length === 1 ? "" : "s"}`
          : criticalCount > 0
            ? `${criticalCount} failed step${criticalCount === 1 ? "" : "s"}`
            : null,
        failedCriteriaCount > 0
          ? `${failedCriteriaCount} below threshold`
          : structuredCriteria.length > 0
            ? "0 below threshold"
            : warningCount > 0
              ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
              : null,
        executionLoopSummary?.deltaLabel || null,
        durationLabel,
        costLabel,
      ].filter((value): value is string => Boolean(value)).slice(0, 5)
    : [
        formatScore(scoreValue),
        criticalCount > 0 ? `${criticalCount} critical` : scoreValue != null || warningCount > 0 || terminalVariant === "failed" ? "0 critical" : null,
        warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : scoreValue != null || criticalCount > 0 ? "0 warnings" : null,
        durationLabel,
        costLabel,
        executionLoopSummary?.attempt && executionLoopSummary.attempt > 1
          ? `Attempt ${executionLoopSummary.attempt}/${executionLoopSummary.maxAttempts}`
          : null,
      ].filter((value): value is string => Boolean(value)).slice(0, 5)

  const evidencePanelItems = executionLoopSummary?.criteriaBreakdown?.map((criterion) => {
    const scoreLabel = `${criterion.score}/10`
    const detail = executionLoopSummary.threshold
      ? `threshold ${executionLoopSummary.threshold}/10`
      : "structured check"
    const tone: VerdictTone = criterion.score < (executionLoopSummary.threshold || 0)
      ? criterion.score <= Math.max(1, (executionLoopSummary.threshold || 0) - 3)
        ? "danger"
        : "warning"
      : "neutral"
    return {
      id: criterion.id,
      scoreLabel,
      detail,
      tone,
    }
  }) || []

  const preservedText = terminalVariant === "failed"
    ? completedStageCount > 0
      ? completedStageCount === 1
        ? "Previous 1 step remains available."
        : `Previous ${completedStageCount} steps remain available.`
      : "No completed steps were preserved before the failure."
    : terminalVariant === "cancelled"
      ? completedStageCount > 0
        ? completedStageCount === 1
          ? "Completed work remains available from 1 step."
          : `Completed work remains available from ${completedStageCount} steps.`
        : "The run stopped before any step finished."
      : null

  const tone: VerdictTone = terminalVariant === "failed" || criticalCount > 0
    ? "danger"
    : warningCount > 0 || executionLoopSummary?.outcome === "human decision" || executionLoopSummary?.outcome === "retry cap reached"
      ? "warning"
      : "neutral"
  const variant: VerdictVariant = hasDiagnosticStructure
    ? "diagnostic"
    : !isDisplayedResultEmpty && !hasPrimaryContinuation && (terminalVariant === "saved" || terminalVariant === "completed")
      ? "document"
      : "outcome"
  const surfaceMode: VerdictSurfaceMode = variant === "document" ? "document" : "decision"
  const followUpLabel = hasPrimaryContinuation
    ? null
    : variant === "diagnostic"
      ? "Create follow-up flow"
      : variant === "document"
        ? "Start next flow"
        : "Continue with Agent"

  const provenanceLabel = buildProvenanceLabel({
    resultState,
    selectedResultPresentation,
    selectedResultBranchLabel,
    reviewingRunHistory,
    selectedReviewRun,
  })

  return {
    terminalVariant,
    variant,
    surfaceMode,
    tone,
    headline,
    provenanceLabel,
    evidenceItems,
    evidencePanelTitle: evidencePanelItems.length > 0 ? executionLoopSummary?.loopLabel || "Checks" : null,
    evidencePanelItems,
    followUpLabel,
    preservedText,
  }
}

export function useVerdictData(params: Parameters<typeof deriveVerdictData>[0]) {
  return deriveVerdictData(params)
}
