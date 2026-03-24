import { useCallback, useEffect, useRef } from "react"
import type { Dispatch, MutableRefObject, SetStateAction } from "react"

import { subscribeDesktopCommands } from "@/lib/desktop-command-bus"
import type { FlowSurfaceMode, ViewMode } from "@/lib/store"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"
import type { HumanTaskSnapshot, RunResult, RunStatus } from "@shared/types"
import { resolveSavedRunReviewRequested } from "./review-mode"

interface OutputTabRequest {
  tab: "nodes" | "log" | "result" | "history"
  nodeId?: string
  nonce: number
}

export function useWorkflowPanelReviewState({
  runStatus,
  runOutcome,
  runId,
  selectedWorkflowPath,
  selectedPastRun,
  workflowPastRuns,
  selectedResumeTask,
  inputValue,
  lastRunInputRef,
  prepareNewRun,
  showSavedRunReview,
  showAnyReviewMode,
  viewMode,
  hasBlockedResumeState,
  canShowTerminalResultSurface,
  outputPanelRef,
  idleReviewAutoScrollKeyRef,
  resetExecution,
  resetExecutionForFreshStart,
  setInputValue,
  setSelectedPastRun,
  setPrepareNewRun,
  setShowSavedRunReview,
  setWorkflowReviewMode,
  setWorkflowRunBlockReason,
  setOutputTabRequest,
  setViewMode,
  setFlowSurfaceMode,
  focusInputPanel,
  openResult,
  scrollOutputPanelToListViewportStart,
}: {
  runStatus: ExecutionRunStatus
  runOutcome: RunStatus | null
  runId: string | null
  selectedWorkflowPath: string | null
  selectedPastRun: RunResult | null
  workflowPastRuns: RunResult[]
  selectedResumeTask: HumanTaskSnapshot | null
  inputValue: string
  lastRunInputRef: MutableRefObject<string>
  prepareNewRun: boolean
  showSavedRunReview: boolean
  showAnyReviewMode: boolean
  viewMode: ViewMode
  hasBlockedResumeState: boolean
  canShowTerminalResultSurface: boolean
  outputPanelRef: MutableRefObject<HTMLDivElement | null>
  idleReviewAutoScrollKeyRef: MutableRefObject<string | null>
  resetExecution: () => void
  resetExecutionForFreshStart: () => void
  setInputValue: (value: string) => void
  setSelectedPastRun: (value: RunResult | null) => void
  setPrepareNewRun: (value: boolean) => void
  setShowSavedRunReview: (value: boolean) => void
  setWorkflowReviewMode: (value: boolean) => void
  setWorkflowRunBlockReason: (value: string | null) => void
  setOutputTabRequest: Dispatch<SetStateAction<OutputTabRequest | null>>
  setViewMode: (value: ViewMode) => void
  setFlowSurfaceMode: (value: FlowSurfaceMode) => void
  focusInputPanel: () => void
  openResult: () => void
  scrollOutputPanelToListViewportStart: (padding?: number) => boolean
}) {
  const completionSurfaceRef = useRef<string | null>(null)
  const savedRunReviewRequested = resolveSavedRunReviewRequested({
    showSavedRunReview,
    hasSelectedPastRun: selectedPastRun !== null,
  })

  useEffect(() => {
    const isTerminalResultState =
      runStatus === "error" ||
      (runStatus === "done" &&
        runOutcome !== "blocked" &&
        runOutcome !== "cancelled")
    if (
      !isTerminalResultState ||
      !canShowTerminalResultSurface ||
      viewMode !== "list"
    ) {
      completionSurfaceRef.current = null
      return
    }
    setShowSavedRunReview(true)
    const completionKey = `${selectedWorkflowPath ?? "__draft__"}:${runId || runOutcome || runStatus}`
    if (completionSurfaceRef.current === completionKey) return
    completionSurfaceRef.current = completionKey
    openResult()
  }, [
    canShowTerminalResultSurface,
    openResult,
    runId,
    runOutcome,
    runStatus,
    selectedWorkflowPath,
    setShowSavedRunReview,
    viewMode,
  ])

  const handleStartNewRun = useCallback(() => {
    const previousInput = inputValue || lastRunInputRef.current
    if (runStatus !== "idle") {
      resetExecution()
    }
    resetExecutionForFreshStart()
    setOutputTabRequest(null)
    if (!inputValue && previousInput) {
      setInputValue(previousInput)
    }
    setShowSavedRunReview(false)
    setPrepareNewRun(true)
    setViewMode("list")
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusInputPanel())
    })
  }, [
    focusInputPanel,
    inputValue,
    lastRunInputRef,
    resetExecution,
    resetExecutionForFreshStart,
    runStatus,
    setInputValue,
    setOutputTabRequest,
    setPrepareNewRun,
    setShowSavedRunReview,
    setViewMode,
  ])

  const openRunHistory = useCallback(() => {
    if (workflowPastRuns.length === 0) return
    setPrepareNewRun(false)
    setShowSavedRunReview(true)
    if (!selectedPastRun) {
      setSelectedPastRun(workflowPastRuns[0] || null)
    }
    setViewMode("list")
    setOutputTabRequest({ tab: "nodes", nonce: Date.now() })
  }, [
    runStatus,
    selectedPastRun,
    setOutputTabRequest,
    setPrepareNewRun,
    setSelectedPastRun,
    setShowSavedRunReview,
    setViewMode,
    workflowPastRuns,
  ])

  const openEditFlow = useCallback(() => {
    setShowSavedRunReview(false)
    setSelectedPastRun(null)
    setViewMode("list")
    setFlowSurfaceMode("edit")
  }, [
    setFlowSurfaceMode,
    setSelectedPastRun,
    setShowSavedRunReview,
    setViewMode,
  ])

  useEffect(() => {
    if (runStatus !== "idle") return
    if (workflowPastRuns.length === 0) {
      if (selectedPastRun) {
        setSelectedPastRun(null)
      }
      return
    }
    if (prepareNewRun) return
    const preferredBlockedRun = selectedResumeTask
      ? workflowPastRuns.find(
          (run) => run.runId === selectedResumeTask.sourceRunId,
        ) || null
      : null
    if (preferredBlockedRun) {
      if (selectedPastRun?.runId === preferredBlockedRun.runId) return
      setSelectedPastRun(preferredBlockedRun)
      return
    }
    if (!savedRunReviewRequested) {
      if (selectedPastRun) {
        setSelectedPastRun(null)
      }
      return
    }
    if (
      selectedPastRun &&
      workflowPastRuns.some((run) => run.runId === selectedPastRun.runId)
    )
      return
    setSelectedPastRun(workflowPastRuns[0])
  }, [
    prepareNewRun,
    runStatus,
    selectedPastRun,
    selectedResumeTask,
    setSelectedPastRun,
    savedRunReviewRequested,
    workflowPastRuns,
  ])

  useEffect(() => {
    if (showAnyReviewMode) {
      setWorkflowReviewMode(true)
      setOutputTabRequest((previous) => {
        if (previous?.tab === "result") return previous
        return { tab: "result", nonce: Date.now() }
      })
      return
    }
    setWorkflowReviewMode(false)
  }, [setOutputTabRequest, setWorkflowReviewMode, showAnyReviewMode])

  useEffect(() => {
    return subscribeDesktopCommands((commandId) => {
      if (commandId === "view.edit_flow") {
        if (runStatus !== "idle" || showAnyReviewMode) return
        openEditFlow()
        return
      }
      if (commandId === "flow.run_again") {
        if (runStatus !== "idle" || workflowPastRuns.length === 0) return
        handleStartNewRun()
        return
      }
      if (commandId === "flow.history") {
        openRunHistory()
      }
    })
  }, [
    handleStartNewRun,
    openEditFlow,
    openRunHistory,
    runStatus,
    showAnyReviewMode,
    workflowPastRuns.length,
  ])

  useEffect(() => {
    if (!hasBlockedResumeState || !selectedResumeTask) {
      setWorkflowRunBlockReason(null)
      return
    }

    setWorkflowRunBlockReason(
      selectedResumeTask.kind === "approval"
        ? "Complete the open approval before running this step."
        : "Provide the requested input before running this step.",
    )

    return () => {
      setWorkflowRunBlockReason(null)
    }
  }, [hasBlockedResumeState, selectedResumeTask, setWorkflowRunBlockReason])

  useEffect(() => {
    if (!showAnyReviewMode || viewMode !== "list") return

    const reviewKey = `${selectedWorkflowPath || "no-flow"}::${selectedPastRun?.runId || "latest"}`
    if (idleReviewAutoScrollKeyRef.current === reviewKey) return

    idleReviewAutoScrollKeyRef.current = reviewKey
    const tryScroll = () => {
      if (scrollOutputPanelToListViewportStart(16)) return
      outputPanelRef.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      })
    }

    window.requestAnimationFrame(() => {
      tryScroll()
      window.requestAnimationFrame(() => {
        tryScroll()
      })
    })
  }, [
    idleReviewAutoScrollKeyRef,
    outputPanelRef,
    scrollOutputPanelToListViewportStart,
    selectedPastRun?.runId,
    selectedWorkflowPath,
    showAnyReviewMode,
    viewMode,
  ])

  useEffect(() => {
    if (runStatus !== "idle" && prepareNewRun) {
      setPrepareNewRun(false)
    }
  }, [prepareNewRun, runStatus, setPrepareNewRun])

  return {
    handleStartNewRun,
    openEditFlow,
  }
}
