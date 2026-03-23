import type {
  ArtifactRecord,
  HumanTaskSnapshot,
  HumanTaskSummary,
} from "@shared/types"

type BlockedTaskLike =
  | Pick<HumanTaskSummary, "kind" | "summary" | "instructions" | "title">
  | Pick<HumanTaskSnapshot, "kind" | "summary" | "instructions" | "title">

function compactText(value: string | null | undefined, maxLength = 160) {
  const normalized = (value || "").replace(/\s+/g, " ").trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

export function deriveBlockedTaskStatusText(
  task: Pick<BlockedTaskLike, "kind">,
  stepLabel?: string | null,
) {
  const actionTarget = (stepLabel || "").trim()
  return task.kind === "approval"
    ? actionTarget
      ? `Blocked: awaiting your approval before ${actionTarget} can continue.`
      : "Blocked: awaiting your approval before the flow can continue."
    : actionTarget
      ? `Blocked: waiting for input before ${actionTarget} can continue.`
      : "Blocked: waiting for input before the flow can continue."
}

export function deriveBlockedTaskReasonText(
  task: Pick<BlockedTaskLike, "summary" | "instructions" | "kind" | "title">,
  stepLabel?: string | null,
) {
  const explicitReason = compactText(task.summary || task.instructions)
  if (explicitReason) return explicitReason
  if (task.kind === "approval") {
    return stepLabel
      ? `${stepLabel} is paused until you record the next approval decision.`
      : "This flow is paused until you record the next approval decision."
  }
  return stepLabel
    ? `${stepLabel} is waiting for the missing input before the flow can continue.`
    : "This flow is waiting for the missing input before it can continue."
}

export function deriveBlockedTaskLatestResultText(
  artifact: ArtifactRecord | null,
) {
  return artifact ? `Latest result: ${artifact.title}.` : null
}
