import { useEffect, useState } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  runStatusAtom,
  selectedPastRunAtom,
  workflowHistoryRunsAtom,
} from "@/features/execution"
import { updateWorkflowExecutionStateAtom } from "@/features/execution/state"
import { toWorkflowExecutionKey } from "@/lib/workflow-execution"
import type { LoadedRunResult, RunResult } from "@shared/types"

export function useSelectedRunReview(enabled: boolean) {
  const [runStatus] = useAtom(runStatusAtom)
  const [pastRuns] = useAtom(workflowHistoryRunsAtom)
  const [selectedPastRun] = useAtom(selectedPastRunAtom)
  const [reviewedRunDetails, setReviewedRunDetails] =
    useState<LoadedRunResult | null>(null)
  const [reviewedRunLoading, setReviewedRunLoading] = useState(false)
  const [reviewedRunError, setReviewedRunError] = useState<string | null>(null)
  const updateExecutionState = useSetAtom(updateWorkflowExecutionStateAtom)

  const reviewedRun: RunResult | null = selectedPastRun || pastRuns[0] || null

  useEffect(() => {
    if (!enabled || runStatus !== "idle" || !reviewedRun?.workspace) {
      setReviewedRunDetails(null)
      setReviewedRunLoading(false)
      setReviewedRunError(null)
      return
    }

    let cancelled = false
    setReviewedRunLoading(true)
    setReviewedRunError(null)

    const workflowExecutionKey = toWorkflowExecutionKey(
      reviewedRun.workflowPath ?? null,
    )

    window.api
      .loadRunResult(reviewedRun.workspace)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setReviewedRunDetails(null)
          setReviewedRunError(
            "Saved run details are unavailable for this flow.",
          )
          return
        }
        setReviewedRunDetails(result)
        if (result.snapshot) {
          updateExecutionState({
            key: workflowExecutionKey,
            update: (prev) => ({
              ...prev,
              nodeStates: result.snapshot!.nodeStates ?? prev.nodeStates,
              runtimeNodes:
                result.snapshot!.runtimeNodes ?? prev.runtimeNodes,
              runtimeEdges:
                result.snapshot!.runtimeEdges ?? prev.runtimeEdges,
              runtimeMeta: result.snapshot!.runtimeMeta ?? prev.runtimeMeta,
              evalResults: result.snapshot!.evalResults ?? prev.evalResults,
            }),
          })
        }
      })
      .catch((error) => {
        if (cancelled) return
        setReviewedRunDetails(null)
        setReviewedRunError("Could not load the selected run result.")
        console.error("[useSelectedRunReview] load past run failed:", error)
      })
      .finally(() => {
        if (!cancelled) setReviewedRunLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, reviewedRun?.runId, reviewedRun?.workspace, runStatus])

  return {
    reviewedRun,
    reviewedRunDetails,
    reviewedRunLoading,
    reviewedRunError,
  }
}
