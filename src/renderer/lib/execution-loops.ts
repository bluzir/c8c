import type {
  EvaluationResult,
  EvaluatorNodeConfig,
  NodeState,
  RunStatus,
  Workflow,
  WorkflowNode,
} from "@shared/types"
import { getRuntimeStagePresentation } from "@/lib/runtime-flow-labels"

export type ExecutionLoopOutcome =
  | "auto-pass"
  | "auto-return"
  | "human decision"
  | "retry cap reached"

export interface ExecutionLoopSummary {
  evaluatorNodeId: string
  loopLabel: string
  title: string
  attempt: number
  maxAttempts: number
  threshold: number
  score: number
  failedCriteriaCount: number
  criteriaText: string
  criteriaBreakdown?: EvaluationResult["criteria"]
  outcome: ExecutionLoopOutcome
  outcomeLabel: string
  outcomeSentence: string
  reason: string
  fixInstructions?: string
  deltaLabel?: string | null
}

export type ExecutionCheckStatus = "passed" | "returned" | "escalated"

export interface ExecutionCheckRecord {
  kind: "check"
  status: ExecutionCheckStatus
  statusLabel: string
  title: string
  summary: string
  detailSummary?: string
}

interface DeriveExecutionLoopSummaryInput {
  workflow: Workflow
  nodeStates: Record<string, NodeState>
  evalResults: Record<string, EvaluationResult[]>
  runOutcome?: RunStatus | null
  preferredEvaluatorNodeId?: string | null
}

function isEvaluatorNode(
  node: WorkflowNode,
): node is Extract<WorkflowNode, { type: "evaluator" }> {
  return node.type === "evaluator"
}

function inferLoopLabel(workflowName: string, nodeTitle: string) {
  const text = `${workflowName} ${nodeTitle}`.toLowerCase()
  if (/\b(verify|verification|preflight|validation|ship)\b/.test(text))
    return "Verify loop"
  if (/\b(review|audit|polish|critique|qa)\b/.test(text)) return "Review loop"
  return "Quality loop"
}

function deriveOutcome({
  latestAttempt,
  evaluatorState,
  maxRetries,
  threshold,
  runOutcome,
  blockingHumanDecision,
}: {
  latestAttempt: EvaluationResult
  evaluatorState?: NodeState
  maxRetries: number
  threshold: number
  runOutcome?: RunStatus | null
  blockingHumanDecision: boolean
}): Pick<ExecutionLoopSummary, "outcome" | "outcomeLabel" | "outcomeSentence"> {
  if (latestAttempt.passed) {
    return {
      outcome: "auto-pass",
      outcomeLabel: "Auto-pass",
      outcomeSentence: `Score ${latestAttempt.score}/10 passed the ${threshold}/10 threshold. Automatic pass.`,
    }
  }

  if (blockingHumanDecision || runOutcome === "blocked") {
    return {
      outcome: "human decision",
      outcomeLabel: "Human decision",
      outcomeSentence: `Score ${latestAttempt.score}/10 stayed below ${threshold}/10. Human decision required before this flow can continue.`,
    }
  }

  if (
    (evaluatorState?.status === "running" ||
      evaluatorState?.status === "pending") &&
    latestAttempt.attempt < maxRetries
  ) {
    return {
      outcome: "auto-return",
      outcomeLabel: "Auto-return",
      outcomeSentence: `Score ${latestAttempt.score}/10 stayed below ${threshold}/10. Automatic return is running.`,
    }
  }

  if (latestAttempt.attempt < maxRetries) {
    return {
      outcome: "auto-return",
      outcomeLabel: "Auto-return",
      outcomeSentence: `Score ${latestAttempt.score}/10 stayed below ${threshold}/10. Automatic return will retry this loop.`,
    }
  }

  return {
    outcome: "retry cap reached",
    outcomeLabel: "Retry cap reached",
    outcomeSentence: `Score ${latestAttempt.score}/10 stayed below ${threshold}/10 and the retry cap was reached.`,
  }
}

export function deriveExecutionLoopSummary({
  workflow,
  nodeStates,
  evalResults,
  runOutcome = null,
  preferredEvaluatorNodeId = null,
}: DeriveExecutionLoopSummaryInput): ExecutionLoopSummary | null {
  const blockingHumanDecision = Object.values(nodeStates).some(
    (state) =>
      state.status === "waiting_approval" || state.status === "waiting_human",
  )

  const candidates = workflow.nodes
    .filter(isEvaluatorNode)
    .map((node) => ({
      node,
      attempts: evalResults[node.id] || [],
      nodeState: nodeStates[node.id],
    }))
    .filter((candidate) => candidate.attempts.length > 0)

  if (candidates.length === 0) return null

  candidates.sort((left, right) => {
    const leftPreferred = left.node.id === preferredEvaluatorNodeId ? 1 : 0
    const rightPreferred = right.node.id === preferredEvaluatorNodeId ? 1 : 0
    if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred

    const leftPriority =
      left.nodeState?.status === "waiting_approval" ||
      left.nodeState?.status === "waiting_human" ||
      left.nodeState?.status === "running"
        ? 1
        : 0
    const rightPriority =
      right.nodeState?.status === "waiting_approval" ||
      right.nodeState?.status === "waiting_human" ||
      right.nodeState?.status === "running"
        ? 1
        : 0
    if (leftPriority !== rightPriority) return rightPriority - leftPriority

    const leftCompletedAt =
      left.nodeState?.completedAt || left.nodeState?.startedAt || 0
    const rightCompletedAt =
      right.nodeState?.completedAt || right.nodeState?.startedAt || 0
    if (leftCompletedAt !== rightCompletedAt)
      return rightCompletedAt - leftCompletedAt

    return right.attempts.length - left.attempts.length
  })

  const selected = candidates[0]
  if (!selected) return null

  const config = selected.node.config as EvaluatorNodeConfig
  const latestAttempt = selected.attempts[selected.attempts.length - 1]
  if (!latestAttempt) return null

  const previousAttempt =
    selected.attempts.length > 1
      ? selected.attempts[selected.attempts.length - 2]
      : null
  const failedCriteriaCount =
    latestAttempt.criteria?.filter(
      (criterion) => criterion.score < config.threshold,
    ).length || 0
  const presentation = getRuntimeStagePresentation(selected.node, {
    fallbackId: selected.node.id,
  })
  const outcome = deriveOutcome({
    latestAttempt,
    evaluatorState: selected.nodeState,
    maxRetries: config.maxRetries,
    threshold: config.threshold,
    runOutcome,
    blockingHumanDecision,
  })

  return {
    evaluatorNodeId: selected.node.id,
    loopLabel: inferLoopLabel(workflow.name || "", presentation.title),
    title: presentation.title,
    attempt: latestAttempt.attempt,
    maxAttempts: Math.max(config.maxRetries, latestAttempt.attempt),
    threshold: config.threshold,
    score: latestAttempt.score,
    failedCriteriaCount,
    criteriaText: config.criteria,
    criteriaBreakdown: latestAttempt.criteria,
    outcome: outcome.outcome,
    outcomeLabel: outcome.outcomeLabel,
    outcomeSentence: outcome.outcomeSentence,
    reason: latestAttempt.reason,
    fixInstructions: latestAttempt.fix_instructions,
    deltaLabel: previousAttempt
      ? `${previousAttempt.score}/10 -> ${latestAttempt.score}/10`
      : null,
  }
}

export function deriveExecutionCheckRecord(
  summary: ExecutionLoopSummary | null,
): ExecutionCheckRecord | null {
  if (!summary || summary.outcome === "human decision") return null

  if (summary.outcome === "auto-pass") {
    return {
      kind: "check",
      status: "passed",
      statusLabel: "Passed",
      title: summary.title,
      summary: summary.reason || summary.outcomeSentence,
      detailSummary: summary.criteriaBreakdown?.length ? "Why / checks" : "Why",
    }
  }

  if (summary.outcome === "auto-return") {
    return {
      kind: "check",
      status: "returned",
      statusLabel: "Returned to fix",
      title: summary.title,
      summary:
        summary.fixInstructions || summary.reason || summary.outcomeSentence,
      detailSummary: summary.criteriaBreakdown?.length ? "Why / checks" : "Why",
    }
  }

  return {
    kind: "check",
    status: "escalated",
    statusLabel: "Escalated",
    title: summary.title,
    summary: summary.reason || summary.outcomeSentence,
    detailSummary: summary.criteriaBreakdown?.length ? "Why / checks" : "Why",
  }
}
