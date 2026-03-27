import type {
  FlowChatMessage,
  FlowAction,
  FlowFollowUp,
  FlowResultFile,
  DecisionContent,
  CompleteContent,
  ErrorContent,
  ProgressStep,
} from "./flow-chat-types"

const MAX_FOLLOW_UPS = 3
const MAX_ARTIFACTS = 3

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

function formatCost(usd: number): string {
  if (usd < 0.01) return "<$0.01"
  return `$${usd.toFixed(2)}`
}

interface CompleteInput {
  runId: string
  flowName: string
  summary: string
  findings: string[]
  limitations: string[]
  artifacts: FlowResultFile[]
  followUps: FlowFollowUp[]
  durationMs: number
  costUsd: number
}

interface ApprovalDecisionInput {
  type: "approval"
  runId: string
  nodeId: string
  flowName: string
  content: string
  message?: string
}

interface EvalExhaustedDecisionInput {
  type: "eval-exhausted"
  runId: string
  nodeId: string
  flowName: string
  score: number
  threshold: number
  attempt: number
  reason?: string
  fixInstructions?: string
  criteria?: Array<{ id: string; score: number }>
}

type DecisionInput = ApprovalDecisionInput | EvalExhaustedDecisionInput

export function buildDecisionMessage(input: DecisionInput): FlowChatMessage {
  const isApproval = input.type === "approval"
  const { runId, nodeId, flowName } = input

  const resultFacts: string[] = []
  const issues: string[] = []

  if (!isApproval) {
    const evalInput = input as EvalExhaustedDecisionInput
    if (evalInput.reason) {
      issues.push(evalInput.reason)
    }
    if (
      evalInput.fixInstructions &&
      evalInput.fixInstructions !== evalInput.reason
    ) {
      issues.push(evalInput.fixInstructions)
    }
    if (evalInput.criteria) {
      for (const c of evalInput.criteria) {
        if (c.score < evalInput.threshold) {
          issues.push(`${c.id}: below threshold`)
        } else {
          resultFacts.push(`${c.id}: passed`)
        }
      }
    }
  }

  const question = isApproval
    ? "Review the result and continue when ready."
    : "The automatic check couldn't pass — accept the result as-is, or stop and restart?"

  const actions: FlowAction[] = [
    {
      label: isApproval ? "Accept" : "Accept as-is",
      variant: "primary",
      action: isApproval
        ? { type: "approve", runId, nodeId }
        : { type: "override", runId, nodeId },
    },
    {
      label: "Stop & restart",
      variant: "secondary",
      action: { type: "retry", runId, nodeId },
    },
    {
      label: "Show details",
      variant: "ghost",
      action: { type: "expand-details" },
    },
    {
      label: "Stop flow",
      variant: "destructive",
      action: { type: "reject", runId, nodeId },
    },
  ]

  const summary = isApproval
    ? (input as ApprovalDecisionInput).message ||
      "Step completed. Ready for review."
    : `Check didn't pass after ${(input as EvalExhaustedDecisionInput).attempt} attempts.`

  const data: DecisionContent = {
    tone: isApproval ? "approval" : "eval-exhausted",
    summary,
    resultFacts,
    issues,
    question,
    actions,
    editableContent: isApproval
      ? (input as ApprovalDecisionInput).content
      : undefined,
    nodeId,
    runId,
  }

  return {
    id: crypto.randomUUID(),
    flowName,
    timestamp: Date.now(),
    content: { type: "decision", data },
  }
}

export function buildCompleteMessage(input: CompleteInput): FlowChatMessage {
  // Prioritize: contextual first (up to 1), then recommended_next
  const contextual = input.followUps.filter((f) => f.source === "contextual")
  const template = input.followUps.filter(
    (f) => f.source === "recommended_next",
  )
  const cappedFollowUps = [
    ...contextual.slice(0, 1),
    ...template.slice(0, MAX_FOLLOW_UPS - Math.min(contextual.length, 1)),
  ].slice(0, MAX_FOLLOW_UPS)

  const data: CompleteContent = {
    summary: input.summary,
    findings: input.findings,
    limitations: input.limitations,
    artifacts: input.artifacts.slice(0, MAX_ARTIFACTS),
    followUps: cappedFollowUps,
    metrics: {
      duration: formatDuration(input.durationMs),
      cost: formatCost(input.costUsd),
    },
    runId: input.runId,
  }

  return {
    id: crypto.randomUUID(),
    flowName: input.flowName,
    timestamp: Date.now(),
    content: { type: "complete", data },
  }
}

export function buildStartMessage(input: {
  flowName: string
  description: string
}): FlowChatMessage {
  return {
    id: crypto.randomUUID(),
    flowName: input.flowName,
    timestamp: Date.now(),
    content: {
      type: "start",
      data: { description: input.description },
    },
  }
}

export function buildProgressMessage(input: {
  flowName: string
  steps: ProgressStep[]
  startedAt?: number
}): FlowChatMessage {
  const startedAt = input.startedAt ?? Date.now()
  return {
    id: crypto.randomUUID(),
    flowName: input.flowName,
    timestamp: Date.now(),
    content: {
      type: "progress",
      data: { steps: input.steps, startedAt },
    },
  }
}

export function buildTimeoutWarningMessage(input: {
  workflowKey: string
  flowName: string
}): FlowChatMessage {
  return {
    id: `timeout-warning-${input.workflowKey}-${Date.now()}`,
    flowName: input.flowName,
    timestamp: Date.now(),
    content: {
      type: "error",
      data: {
        variant: "timeout",
        tone: "warning",
        flowName: input.flowName,
        summary: "No updates in 10 minutes \u2014 the flow may be stuck.",
        suggestions: [
          "You can cancel and retry, or wait for the flow to resume.",
        ],
        actions: [],
      },
    },
  }
}

interface ErrorInput {
  runId: string
  flowName: string
  variant: "error" | "cancelled" | "interrupted"
  errorMessage?: string
  failedNodeLabel?: string
  failedNodeId?: string
}

export function buildErrorMessage(input: ErrorInput): FlowChatMessage {
  let summary: string
  let suggestions: string[] = []
  const actions: FlowAction[] = []

  switch (input.variant) {
    case "error":
      summary = input.failedNodeLabel
        ? `Step "${input.failedNodeLabel}" couldn't complete${input.errorMessage ? `: ${input.errorMessage}` : "."}`
        : input.errorMessage || "Flow encountered an error."
      suggestions = [
        "Check the step details for more information.",
        "Try running the flow again.",
      ]
      if (input.failedNodeId) {
        actions.push({
          label: "Retry from failed step",
          variant: "primary",
          action: {
            type: "retry",
            runId: input.runId,
            nodeId: input.failedNodeId,
          },
        })
      }
      actions.push({
        label: "Start fresh run",
        variant: input.failedNodeId ? "secondary" : "primary",
        action: { type: "retry", runId: input.runId, nodeId: "" },
      })
      break
    case "cancelled":
      summary = "Flow stopped."
      actions.push({
        label: "Start again",
        variant: "secondary",
        action: { type: "retry", runId: input.runId, nodeId: "" },
      })
      break
    case "interrupted":
      summary = "Flow was interrupted (app closed during execution)."
      suggestions = [
        "Your progress was saved. You can continue from where it stopped.",
      ]
      actions.push({
        label: "Continue",
        variant: "primary",
        action: { type: "retry", runId: input.runId, nodeId: "" },
      })
      actions.push({
        label: "Start again",
        variant: "secondary",
        action: { type: "retry", runId: input.runId, nodeId: "" },
      })
      break
  }

  const toneMap: Record<ErrorInput["variant"], ErrorContent["tone"]> = {
    error: "danger",
    cancelled: "warning",
    interrupted: "info",
  }

  return {
    id: crypto.randomUUID(),
    flowName: input.flowName,
    timestamp: Date.now(),
    content: {
      type: "error",
      data: {
        variant: input.variant,
        tone: toneMap[input.variant],
        summary,
        suggestions,
        actions,
      },
    },
  }
}
