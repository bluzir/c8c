import { useMemo } from "react"
import type { RunResult } from "@shared/types"
import type { WorkflowExecutionState } from "@/features/execution"
import {
  buildDashboardEntries,
  dashboardAggregateCounts,
  groupDashboardEntries,
  isRunInFlight,
} from "./dashboardModel"

export function useMultiRunDashboardEntries({
  workflowExecutionStates,
  approvalRequests,
  pastRuns,
  selectedWorkflowPath,
}: {
  workflowExecutionStates: Record<string, WorkflowExecutionState>
  approvalRequests: Array<{
    workflowKey: string
    message?: string | null
    nodeId: string
  }>
  pastRuns: RunResult[]
  selectedWorkflowPath: string | null
}) {
  const entriesWithHistory = useMemo(
    () =>
      buildDashboardEntries({
        workflowExecutionStates,
        approvalRequests,
        pastRuns,
        selectedWorkflowPath,
      }),
    [approvalRequests, pastRuns, selectedWorkflowPath, workflowExecutionStates],
  )

  const activeCount = useMemo(
    () =>
      entriesWithHistory.filter((entry) => isRunInFlight(entry.runStatus))
        .length,
    [entriesWithHistory],
  )

  const aggregateCounts = useMemo(
    () => dashboardAggregateCounts(entriesWithHistory),
    [entriesWithHistory],
  )

  const groupedEntries = useMemo(
    () => groupDashboardEntries(entriesWithHistory),
    [entriesWithHistory],
  )

  return {
    entriesWithHistory,
    activeCount,
    aggregateCounts,
    groupedEntries,
  }
}
