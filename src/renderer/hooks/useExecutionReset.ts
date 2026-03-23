import { useCallback } from "react"
import { useSetAtom } from "jotai"
import { selectedWorkflowExecutionAtom } from "@/features/execution"
import { resetWorkflowExecutionState } from "@/lib/workflow-execution"

interface UseExecutionResetOptions {
  clearReportPath?: boolean
  clearSelectedPastRun?: boolean
  preserveCompletedWork?: boolean
}

export function useExecutionReset({
  clearReportPath = false,
  clearSelectedPastRun = false,
  preserveCompletedWork = false,
}: UseExecutionResetOptions = {}) {
  const setExecutionState = useSetAtom(selectedWorkflowExecutionAtom)

  return useCallback(() => {
    setExecutionState((previous) =>
      resetWorkflowExecutionState(previous, {
        clearReportPath,
        clearSelectedPastRun,
        preserveCompletedWork,
      }),
    )
  }, [
    clearReportPath,
    clearSelectedPastRun,
    preserveCompletedWork,
    setExecutionState,
  ])
}
