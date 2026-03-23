import {
  isRunInFlight,
  type ExecutionRunStatus,
} from "@/lib/workflow-execution"

export function canReplaceCurrentWorkflow(
  runStatus: ExecutionRunStatus,
): boolean {
  return !isRunInFlight(runStatus)
}

export function getReplaceCurrentWorkflowBlockedReason(
  runStatus: ExecutionRunStatus,
): string | null {
  if (canReplaceCurrentWorkflow(runStatus)) return null
  return "Stop the active run first, or create a new flow file instead of replacing the current one."
}
