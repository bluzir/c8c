import type {
  FlowChatMessage,
  FlowAction,
  DecisionContent,
} from "./flow-chat-types"

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
      label: "Stop",
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
