import { useCallback } from "react"
import type { RunResult, WorkflowFile } from "@shared/types"
import type { WorkflowExecutionState } from "@/lib/workflow-execution"
import {
  compareSidebarWorkflowsByLaunchTime,
  historicalRunVisual,
  workflowHasActiveRunStatus,
} from "./projectSidebarUtils"

interface UseProjectSidebarMetricsParams {
  projectLatestRunsCache: Record<string, Record<string, RunResult>>
  workflowExecutionStates: Record<string, WorkflowExecutionState>
}

export interface WorkflowRunMetrics {
  runStatus: string
  completedSteps: number
  failedSteps: number
  progress: number
  totalSteps: number
  waitingSteps: number
  barClass: string
  textClass: string
  showProgressTrack: boolean
}

export function useProjectSidebarMetrics({
  projectLatestRunsCache,
  workflowExecutionStates,
}: UseProjectSidebarMetricsParams) {
  const getWorkflowRunMetrics = useCallback(
    (workflowPath: string): WorkflowRunMetrics => {
      const executionState = workflowExecutionStates[workflowPath]
      const runStatus = executionState?.runStatus ?? "idle"
      const activeRunStates = Object.values(executionState?.nodeStates ?? {})
      let completedSteps = 0
      let failedSteps = 0
      let waitingSteps = 0

      for (const state of activeRunStates) {
        const status = state.status || "pending"
        if (status === "completed" || status === "skipped") completedSteps += 1
        if (status === "failed") failedSteps += 1
        if (status === "waiting_approval" || status === "waiting_human")
          waitingSteps += 1
      }

      const totalSteps = activeRunStates.length
      const progress =
        totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
      const toneClass =
        runStatus === "paused" || runStatus === "cancelling" || waitingSteps > 0
          ? "status-warning"
          : failedSteps > 0
            ? "status-danger"
            : "status-info"

      return {
        runStatus,
        completedSteps,
        failedSteps,
        progress,
        totalSteps,
        waitingSteps,
        barClass:
          toneClass === "status-warning"
            ? "bg-status-warning"
            : toneClass === "status-danger"
              ? "bg-status-danger"
              : "bg-status-info",
        textClass:
          toneClass === "status-warning"
            ? "text-status-warning"
            : toneClass === "status-danger"
              ? "text-status-danger"
              : "text-status-info",
        showProgressTrack:
          workflowHasActiveRunStatus(runStatus) && totalSteps > 0,
      }
    },
    [workflowExecutionStates],
  )

  const getProjectStatusRollup = useCallback(
    (projectPath: string, projectWorkflows: WorkflowFile[]) => {
      let activeCount = 0
      let waitingCount = 0
      let blockedCount = 0

      for (const workflow of projectWorkflows) {
        const metrics = getWorkflowRunMetrics(workflow.path)
        const latestRun = projectLatestRunsCache[projectPath]?.[workflow.path]
        const runIsActive = workflowHasActiveRunStatus(metrics.runStatus)
        const runIsWaiting =
          metrics.waitingSteps > 0 ||
          metrics.runStatus === "paused" ||
          metrics.runStatus === "cancelling"
        const runIsBlocked =
          metrics.failedSteps > 0 ||
          (!runIsActive &&
            (latestRun?.status === "failed" ||
              latestRun?.status === "interrupted"))

        if (runIsActive) activeCount += 1
        if (runIsWaiting) waitingCount += 1
        if (runIsBlocked) blockedCount += 1
      }

      return {
        activeCount,
        waitingCount,
        blockedCount,
      }
    },
    [getWorkflowRunMetrics, projectLatestRunsCache],
  )

  const sortProjectWorkflows = useCallback(
    (projectPath: string, projectWorkflows: WorkflowFile[]) => {
      return [...projectWorkflows].sort((left, right) => {
        const leftLatestRun = projectLatestRunsCache[projectPath]?.[left.path]
        const rightLatestRun = projectLatestRunsCache[projectPath]?.[right.path]
        return compareSidebarWorkflowsByLaunchTime({
          leftWorkflow: left,
          rightWorkflow: right,
          leftExecutionState: workflowExecutionStates[left.path],
          rightExecutionState: workflowExecutionStates[right.path],
          leftLatestRun,
          rightLatestRun,
        })
      })
    },
    [projectLatestRunsCache, workflowExecutionStates],
  )

  const getHistoricalRunVisual = useCallback(
    (projectPath: string, workflowPath: string) => {
      const latestRun = projectLatestRunsCache[projectPath]?.[workflowPath]
      return {
        latestRun,
        latestRunMeta: historicalRunVisual(latestRun?.status),
      }
    },
    [projectLatestRunsCache],
  )

  return {
    getWorkflowRunMetrics,
    getProjectStatusRollup,
    sortProjectWorkflows,
    getHistoricalRunVisual,
  }
}
