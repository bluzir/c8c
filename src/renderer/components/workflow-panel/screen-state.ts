import type { ExecutionRunStatus } from "@/lib/workflow-execution"
import type { RunStatus, WorkflowTemplate } from "@shared/types"

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
  if (showAnyReviewMode) {
    return "review"
  }

  if (runStatus === "paused") {
    return "paused_resume"
  }

  if (hasBlockedResumeState || (runStatus === "done" && runOutcome === "blocked")) {
    return "blocked_decision"
  }

  if (runStatus === "starting" || runStatus === "running" || runStatus === "cancelling") {
    return "running"
  }

  if (runStatus === "idle" && hasActiveEntryState) {
    return hasSourceArtifacts ? "cross_flow_handoff" : "fresh_start"
  }

  if (
    !prepareNewRun
    && canShowTerminalResultSurface
    && (runStatus === "error" || (runStatus === "done" && runOutcome !== "blocked"))
  ) {
    return nextStageTemplate ? "auto_chain_gate" : "one_off_done"
  }

  return "fresh_start"
}

export function shouldShowProcessSpine(state: WorkflowPrimaryScreenState) {
  return state !== "fresh_start"
    && state !== "cross_flow_handoff"
    && state !== "one_off_done"
}

export function shouldShowLiveOutputPanel(state: WorkflowPrimaryScreenState) {
  return state !== "fresh_start"
    && state !== "cross_flow_handoff"
    && state !== "blocked_decision"
}
