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

// Internal screen-composition contract only. These ids drive ownership and
// layout decisions; they must not leak into user-facing copy.
export type WorkflowListSurfaceIntent =
  | "start_ready"
  | "start_needs_input"
  | "resume_ready"
  | "resume_needs_input"
  | "blocked_decision"
  | "runtime_status"
  | "result_inspect"

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
  // State alone is not enough to decide whether the spine should render.
  // Empty fresh-start screens have no process data, so the render path stays
  // hidden upstream when `processSpineStages` is null. Once a routed path
  // exists, the spine should stay visible across runtime states.
  void state
  return true
}

export function resolveWorkflowListSurfaceIntent({
  primaryScreenState,
  showResumeHeader,
  readyToRun,
}: {
  primaryScreenState: WorkflowPrimaryScreenState
  showResumeHeader: boolean
  readyToRun: boolean
}): WorkflowListSurfaceIntent {
  if (showResumeHeader) {
    return readyToRun ? "resume_ready" : "resume_needs_input"
  }

  switch (primaryScreenState) {
    case "blocked_decision":
      return "blocked_decision"
    case "running":
    case "paused_resume":
      return "runtime_status"
    case "one_off_done":
    case "auto_chain_gate":
    case "review":
      return "result_inspect"
    case "fresh_start":
    case "cross_flow_handoff":
    default:
      return readyToRun ? "start_ready" : "start_needs_input"
  }
}

export function shouldShowInlineInputPanel(intent: WorkflowListSurfaceIntent) {
  return intent === "resume_needs_input" || intent === "start_needs_input"
}

export function shouldShowLiveOutputPanel(state: WorkflowPrimaryScreenState) {
  return (
    state !== "fresh_start" &&
    state !== "cross_flow_handoff" &&
    state !== "blocked_decision"
  )
}
