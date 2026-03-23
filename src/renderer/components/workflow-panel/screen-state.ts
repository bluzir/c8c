import type { ExecutionRunStatus } from "@/lib/workflow-execution"
import type { RunStatus, WorkflowTemplate } from "@shared/types"
import { resolveWorkflowRunDisplayState } from "@/lib/workflow-run-display-state"

export type WorkflowPrimaryScreenState =
  | "fresh_start"
  | "cross_flow_handoff"
  | "paused_resume"
  | "blocked_decision"
  | "running"
  | "one_off_done"
  | "auto_chain_gate"
  | "review"

export function resolveWorkflowPrimaryScreenState({
  runStatus,
  runOutcome,
  showAnyReviewMode,
  hasBlockedResumeState,
  hasActiveEntryState,
  hasSourceArtifacts,
  canShowTerminalResultSurface,
  nextStageTemplate,
  prepareNewRun,
}: {
  runStatus: ExecutionRunStatus
  runOutcome: RunStatus | null
  showAnyReviewMode: boolean
  hasBlockedResumeState: boolean
  hasActiveEntryState: boolean
  hasSourceArtifacts: boolean
  canShowTerminalResultSurface: boolean
  nextStageTemplate: WorkflowTemplate | null
  prepareNewRun: boolean
}): WorkflowPrimaryScreenState {
  const runDisplayState = resolveWorkflowRunDisplayState({
    runStatus,
    runOutcome,
  })

  if (showAnyReviewMode) {
    return "review"
  }

  if (runDisplayState.state === "paused") {
    return "paused_resume"
  }

  if (hasBlockedResumeState || runDisplayState.state === "blocked") {
    return "blocked_decision"
  }

  if (
    runDisplayState.state === "starting" ||
    runDisplayState.state === "running" ||
    runDisplayState.state === "cancelling"
  ) {
    return "running"
  }

  if (runStatus === "idle" && hasActiveEntryState) {
    return hasSourceArtifacts ? "cross_flow_handoff" : "fresh_start"
  }

  if (
    !prepareNewRun &&
    canShowTerminalResultSurface &&
    (runDisplayState.state === "failed" ||
      runDisplayState.state === "completed" ||
      runDisplayState.state === "cancelled")
  ) {
    return nextStageTemplate ? "auto_chain_gate" : "one_off_done"
  }

  return "fresh_start"
}

export function shouldShowProcessSpine(state: WorkflowPrimaryScreenState) {
  return (
    state !== "fresh_start" &&
    state !== "cross_flow_handoff" &&
    state !== "one_off_done"
  )
}

export function shouldShowLiveOutputPanel(state: WorkflowPrimaryScreenState) {
  return (
    state !== "fresh_start" &&
    state !== "cross_flow_handoff" &&
    state !== "blocked_decision"
  )
}
