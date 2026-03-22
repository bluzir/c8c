import type { RunStatus } from "@shared/types"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"

export type WorkflowRunDisplayState =
  | "idle"
  | "starting"
  | "running"
  | "blocked"
  | "paused"
  | "cancelling"
  | "failed"
  | "completed"
  | "cancelled"

export type WorkflowRunDisplayTone = "info" | "success" | "warning" | "danger"

export interface ResolveWorkflowRunDisplayStateArgs {
  runStatus: ExecutionRunStatus
  runOutcome?: RunStatus | null
  approvalCount?: number
  lastError?: string | null
}

export interface WorkflowRunDisplaySummary {
  state: WorkflowRunDisplayState
  label: string
  tone: WorkflowRunDisplayTone
  isInFlight: boolean
  isTerminal: boolean
  needsAttention: boolean
  isFailure: boolean
}

export function resolveWorkflowRunDisplayState({
  runStatus,
  runOutcome = null,
  approvalCount = 0,
  lastError = null,
}: ResolveWorkflowRunDisplayStateArgs): WorkflowRunDisplaySummary {
  const isInFlight = runStatus === "starting"
    || runStatus === "running"
    || runStatus === "paused"
    || runStatus === "cancelling"

  if (runStatus === "paused") {
    return {
      state: "paused",
      label: "Paused",
      tone: "warning",
      isInFlight,
      isTerminal: false,
      needsAttention: false,
      isFailure: false,
    }
  }

  if (runStatus === "starting") {
    return {
      state: "starting",
      label: "Starting",
      tone: "info",
      isInFlight,
      isTerminal: false,
      needsAttention: false,
      isFailure: false,
    }
  }

  if (runStatus === "cancelling") {
    return {
      state: "cancelling",
      label: "Stopping",
      tone: "warning",
      isInFlight,
      isTerminal: false,
      needsAttention: false,
      isFailure: false,
    }
  }

  if (runOutcome === "blocked" || (runStatus === "running" && approvalCount > 0)) {
    const isTerminal = runOutcome === "blocked" || runStatus === "done"
    return {
      state: "blocked",
      label: isTerminal ? "Needs approval" : "Waiting for approval",
      tone: "warning",
      isInFlight,
      isTerminal,
      needsAttention: true,
      isFailure: false,
    }
  }

  if (runStatus === "running") {
    return {
      state: "running",
      label: "Running",
      tone: "info",
      isInFlight,
      isTerminal: false,
      needsAttention: false,
      isFailure: false,
    }
  }

  if (runStatus === "error" || runOutcome === "failed" || runOutcome === "interrupted") {
    return {
      state: "failed",
      label: runOutcome === "interrupted" ? "Interrupted" : "Failed",
      tone: "danger",
      isInFlight,
      isTerminal: true,
      needsAttention: true,
      isFailure: true,
    }
  }

  if (runOutcome === "cancelled") {
    return {
      state: "cancelled",
      label: "Cancelled",
      tone: "warning",
      isInFlight,
      isTerminal: true,
      needsAttention: false,
      isFailure: false,
    }
  }

  if (runOutcome === "completed" || runStatus === "done") {
    return {
      state: "completed",
      label: "Completed",
      tone: "success",
      isInFlight,
      isTerminal: true,
      needsAttention: false,
      isFailure: false,
    }
  }

  if (lastError) {
    return {
      state: "failed",
      label: "Failed",
      tone: "danger",
      isInFlight,
      isTerminal: runStatus === "error" || runStatus === "done",
      needsAttention: true,
      isFailure: true,
    }
  }

  return {
    state: "idle",
    label: "Idle",
    tone: "info",
    isInFlight,
    isTerminal: false,
    needsAttention: false,
    isFailure: false,
  }
}
