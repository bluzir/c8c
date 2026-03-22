import { useCallback, useEffect, useRef, useState } from "react"

import type { ViewMode, WorkflowOpenState } from "@/lib/store"
import { formatElapsedTime } from "@/lib/run-progress"
import type { ExecutionRunStatus } from "@/lib/workflow-execution"
import type { WorkflowEntryState } from "@/lib/workflow-entry"

interface OutputTabRequest {
  tab: "nodes" | "log" | "result" | "history"
  nodeId?: string
  nonce: number
}

export function useWorkflowPanelLifecycle({
  runStatus,
  runStartedAt,
  inputValue,
  viewMode,
  chatOpen,
  selectedWorkflowPath,
  workflowEntryState,
  setWorkflowOpenState,
  setWorkflowEntryState,
  setShowEntryEditor,
  setPrepareNewRun,
  setShowSavedRunReview,
  setOutputTabRequest,
  idleReviewAutoScrollKeyRef,
}: {
  runStatus: ExecutionRunStatus
  runStartedAt: number | null
  inputValue: string
  viewMode: ViewMode
  chatOpen: boolean
  selectedWorkflowPath: string | null
  workflowEntryState: WorkflowEntryState | null
  setWorkflowOpenState: (value: WorkflowOpenState) => void
  setWorkflowEntryState: (value: WorkflowEntryState | null) => void
  setShowEntryEditor: (value: boolean) => void
  setPrepareNewRun: (value: boolean) => void
  setShowSavedRunReview: (value: boolean) => void
  setOutputTabRequest: (value: OutputTabRequest | null) => void
  idleReviewAutoScrollKeyRef: React.MutableRefObject<string | null>
}) {
  const listScrollRegionRef = useRef<HTMLDivElement | null>(null)
  const outputPanelRef = useRef<HTMLDivElement | null>(null)
  const chatPanelShellRef = useRef<HTMLDivElement | null>(null)
  const chatPanelToggleRef = useRef<HTMLButtonElement | null>(null)
  const inputPanelRef = useRef<HTMLDivElement | null>(null)
  const blockedTaskPanelRef = useRef<HTMLDivElement | null>(null)
  const previousRunStatusRef = useRef(runStatus)
  const lastRunInputRef = useRef(inputValue)
  const pendingListAutoScrollRef = useRef(false)
  const [elapsed, setElapsed] = useState("")

  useEffect(() => {
    const previousRunStatus = previousRunStatusRef.current
    if (runStatus === "running" && previousRunStatus !== "running") {
      pendingListAutoScrollRef.current = true
    }
    if (runStatus !== "running") {
      pendingListAutoScrollRef.current = false
    }
    if (previousRunStatus === "idle" && runStatus !== "idle") {
      lastRunInputRef.current = inputValue
    }
    previousRunStatusRef.current = runStatus
  }, [inputValue, runStatus])

  const clearWorkflowOpenState = useCallback(() => {
    setWorkflowOpenState({
      status: "idle",
      targetPath: null,
      message: null,
    })
  }, [setWorkflowOpenState])

  const workflowTitleFromPath = useCallback((path: string | null) => {
    if (!path) return "flow"
    return (
      path
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.(chain|yaml|yml)$/i, "") || "flow"
    )
  }, [])

  const scrollOutputPanelIntoListViewport = useCallback((padding = 12) => {
    const listScrollRegion = listScrollRegionRef.current
    const outputPanel = outputPanelRef.current
    if (!listScrollRegion || !outputPanel) return false

    const regionRect = listScrollRegion.getBoundingClientRect()
    const panelRect = outputPanel.getBoundingClientRect()
    const panelAboveViewport = panelRect.top < regionRect.top + padding
    const panelBelowViewport = panelRect.bottom > regionRect.bottom - padding

    if (!panelAboveViewport && !panelBelowViewport) {
      return true
    }

    const nextTop = panelAboveViewport
      ? listScrollRegion.scrollTop + panelRect.top - regionRect.top - padding
      : listScrollRegion.scrollTop +
        panelRect.bottom -
        regionRect.bottom +
        padding

    listScrollRegion.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" })
    return true
  }, [])

  const scrollOutputPanelToListViewportStart = useCallback((padding = 12) => {
    const listScrollRegion = listScrollRegionRef.current
    const outputPanel = outputPanelRef.current
    if (!listScrollRegion || !outputPanel) return false

    const nextTop = outputPanel.offsetTop - listScrollRegion.offsetTop - padding

    listScrollRegion.scrollTo({ top: Math.max(0, nextTop), behavior: "auto" })
    return true
  }, [])

  useEffect(() => {
    if (
      !runStartedAt ||
      (runStatus !== "running" &&
        runStatus !== "starting" &&
        runStatus !== "cancelling" &&
        runStatus !== "paused")
    ) {
      setElapsed("")
      return
    }

    const tick = () => setElapsed(formatElapsedTime(runStartedAt))
    tick()
    const timerId = window.setInterval(tick, 1000)
    return () => window.clearInterval(timerId)
  }, [runStartedAt, runStatus])

  useEffect(() => {
    if (
      viewMode === "list" &&
      runStatus === "running" &&
      pendingListAutoScrollRef.current
    ) {
      scrollOutputPanelIntoListViewport(16)
      pendingListAutoScrollRef.current = false
    }
  }, [runStatus, scrollOutputPanelIntoListViewport, viewMode])

  useEffect(() => {
    if (chatOpen) return
    const activeElement = document.activeElement as HTMLElement | null
    if (activeElement && chatPanelShellRef.current?.contains(activeElement)) {
      window.requestAnimationFrame(() => {
        chatPanelToggleRef.current?.focus()
      })
    }
  }, [chatOpen])

  useEffect(() => {
    setShowEntryEditor(false)
    setPrepareNewRun(false)
    setShowSavedRunReview(false)
    setOutputTabRequest(null)
    pendingListAutoScrollRef.current = false
    idleReviewAutoScrollKeyRef.current = null
    listScrollRegionRef.current?.scrollTo({ top: 0, behavior: "auto" })
  }, [
    idleReviewAutoScrollKeyRef,
    selectedWorkflowPath,
    setOutputTabRequest,
    setPrepareNewRun,
    setShowEntryEditor,
    setShowSavedRunReview,
  ])

  useEffect(() => {
    if (runStatus !== "idle" && workflowEntryState) {
      setWorkflowEntryState(null)
    }
  }, [runStatus, setWorkflowEntryState, workflowEntryState])

  const focusInputPanel = useCallback(() => {
    const inputPanel = inputPanelRef.current
    if (!inputPanel) return
    inputPanel.scrollIntoView({ behavior: "smooth", block: "start" })
    window.requestAnimationFrame(() => {
      const focusTarget = inputPanel.querySelector<HTMLElement>(
        "textarea, input, [contenteditable='true']",
      )
      focusTarget?.focus()
    })
  }, [])

  const focusBlockedTaskPanel = useCallback(() => {
    const panel = blockedTaskPanelRef.current
    if (!panel) return
    panel.scrollIntoView({ behavior: "smooth", block: "start" })
    window.requestAnimationFrame(() => {
      const focusTarget = panel.querySelector<HTMLElement>(
        "button, textarea, input, select, [contenteditable='true']",
      )
      focusTarget?.focus()
    })
  }, [])

  return {
    listScrollRegionRef,
    outputPanelRef,
    chatPanelShellRef,
    chatPanelToggleRef,
    inputPanelRef,
    blockedTaskPanelRef,
    lastRunInputRef,
    elapsed,
    clearWorkflowOpenState,
    workflowTitleFromPath,
    scrollOutputPanelIntoListViewport,
    scrollOutputPanelToListViewportStart,
    focusInputPanel,
    focusBlockedTaskPanel,
  }
}
