interface ResolveWorkflowRunAvailabilityParams {
  hasSkillNodes: boolean
  inputValid: boolean
  inputValidationMessage: string | null
  hasBlockingErrors: boolean
  blockingValidationCount: number
  workflowRunBlockReason: string | null
}

export function resolveWorkflowRunAvailability({
  hasSkillNodes,
  inputValid,
  inputValidationMessage,
  hasBlockingErrors,
  blockingValidationCount,
  workflowRunBlockReason,
}: ResolveWorkflowRunAvailabilityParams) {
  const runDisabledReason =
    workflowRunBlockReason ||
    (!hasSkillNodes
      ? "Add at least one skill step to run."
      : !inputValid
        ? inputValidationMessage || "Input is required"
        : hasBlockingErrors
          ? `${blockingValidationCount} validation error(s) — fix before running.`
          : null)
  const canRun = runDisabledReason === null
  const canBatchRun = hasSkillNodes && workflowRunBlockReason === null

  return {
    canRun,
    runDisabledReason,
    canBatchRun,
    batchDisabledReason:
      workflowRunBlockReason ||
      (hasSkillNodes
        ? null
        : "Add at least one skill step to enable batch runs."),
    hasRunMenuActions: canRun || canBatchRun,
  }
}
