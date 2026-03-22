import { useCallback, useEffect, useRef, useState } from "react"

import type { RunStatus } from "@shared/types"

import type { OutputTabRequest, OutputTabValue } from "@/components/output/outputPanelTypes"
import type { ExecutionRunStatus, ExecutionSurfaceNotice } from "@/lib/workflow-execution"

export function useOutputPanelSurfaceState({
  requestedTab,
  showResultSurface,
  reviewingRunHistory,
  pastRunCount,
  canInspectActivity,
  canInspectLog,
  runStatus,
  effectiveRunOutcome,
  runId,
  surfaceNotice,
  selectedStageId,
  selectedResultNodeId,
  displayNodeIds,
  setInspectedNodeId,
  setSurfaceNotice,
  onOpenInbox,
}: {
  requestedTab?: OutputTabRequest | null
  showResultSurface: boolean
  reviewingRunHistory: boolean
  pastRunCount: number
  canInspectActivity: boolean
  canInspectLog: boolean
  runStatus: ExecutionRunStatus
  effectiveRunOutcome: RunStatus | null
  runId: string | null
  surfaceNotice: ExecutionSurfaceNotice | null
  selectedStageId: string | null
  selectedResultNodeId: string | null
  displayNodeIds: string[]
  setInspectedNodeId: (nodeId: string) => void
  setSurfaceNotice: (value: ExecutionSurfaceNotice | null) => void
  onOpenInbox?: () => void
}) {
  const [activeTab, setActiveTab] = useState<OutputTabValue>("nodes")
  const [resultReadyPulse, setResultReadyPulse] = useState(false)
  const resultPulseTimerRef = useRef<number | null>(null)
  const resultSignalShownRef = useRef(false)
  const previousRunStatusRef = useRef(runStatus)
  const surfaceIdentityRef = useRef<string | null>(null)

  const cancelResultReadyPulse = useCallback(() => {
    if (resultPulseTimerRef.current) {
      window.clearTimeout(resultPulseTimerRef.current)
      resultPulseTimerRef.current = null
    }
  }, [])

  const clearResultReadyPulse = useCallback(() => {
    cancelResultReadyPulse()
    setResultReadyPulse(false)
  }, [cancelResultReadyPulse])

  const queueResultReadyPulse = useCallback(() => {
    cancelResultReadyPulse()
    setResultReadyPulse(true)
    resultPulseTimerRef.current = window.setTimeout(() => {
      setResultReadyPulse(false)
      resultPulseTimerRef.current = null
    }, 2800)
  }, [cancelResultReadyPulse])

  const openNodeDetails = useCallback((nodeId: string) => {
    setInspectedNodeId(nodeId)
    setActiveTab("nodes")
  }, [setInspectedNodeId])

  const focusStageSurface = useCallback((tab: "nodes" | "log") => {
    const fallbackNodeId = selectedStageId
      || selectedResultNodeId
      || displayNodeIds[displayNodeIds.length - 1]
      || displayNodeIds[0]
      || null

    if (fallbackNodeId) {
      setInspectedNodeId(fallbackNodeId)
    }
    setActiveTab(tab)
  }, [displayNodeIds, selectedResultNodeId, selectedStageId, setInspectedNodeId])

  const activateResultSurface = useCallback(() => {
    setResultReadyPulse(false)
    if (selectedResultNodeId) {
      setInspectedNodeId(selectedResultNodeId)
    }
    setActiveTab("result")
  }, [selectedResultNodeId, setInspectedNodeId])

  const handleSurfaceNoticeAction = useCallback(() => {
    if (!surfaceNotice) return
    if (surfaceNotice.actionTarget === "result") {
      setActiveTab("result")
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "activity") {
      setActiveTab("nodes")
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "inbox" && onOpenInbox) {
      onOpenInbox()
      setSurfaceNotice(null)
    }
  }, [onOpenInbox, setSurfaceNotice, surfaceNotice])

  useEffect(() => {
    if (!showResultSurface && activeTab === "result") {
      setActiveTab("nodes")
    }
  }, [activeTab, showResultSurface])

  useEffect(() => {
    if (activeTab === "history" && pastRunCount === 0) {
      setActiveTab("nodes")
    }
  }, [activeTab, pastRunCount])

  useEffect(() => {
    if (activeTab !== "log") return
    if (canInspectLog) return
    setActiveTab(canInspectActivity ? "nodes" : showResultSurface ? "result" : "nodes")
  }, [activeTab, canInspectActivity, canInspectLog, showResultSurface])

  const preferredTopLevelTab = (
    showResultSurface
    && (
      reviewingRunHistory
      || runStatus === "error"
      || (runStatus === "done" && effectiveRunOutcome !== "blocked")
    )
  )
    ? "result"
    : "nodes"
  const surfaceIdentityKey = reviewingRunHistory
    ? "review"
    : `live:${runId || "none"}`

  useEffect(() => {
    if (requestedTab) return
    if (surfaceIdentityRef.current === surfaceIdentityKey) return
    surfaceIdentityRef.current = surfaceIdentityKey

    if (preferredTopLevelTab === "result" && showResultSurface) {
      setActiveTab("result")
      return
    }

    setActiveTab("nodes")
  }, [preferredTopLevelTab, requestedTab, showResultSurface, surfaceIdentityKey])

  useEffect(() => {
    if (!requestedTab) return
    if (requestedTab.tab === "result" && !showResultSurface) return
    if (requestedTab.tab === "history" && pastRunCount === 0) return
    if (requestedTab.nodeId) {
      setInspectedNodeId(requestedTab.nodeId)
    }
    setActiveTab(requestedTab.tab)
  }, [pastRunCount, requestedTab, setInspectedNodeId, showResultSurface])

  useEffect(() => {
    const previousStatus = previousRunStatusRef.current
    const reachedTerminal = runStatus === "done" || runStatus === "error"
    const wasTerminal = previousStatus === "done" || previousStatus === "error"
    const justEnteredTerminal = reachedTerminal && !wasTerminal

    if (!showResultSurface || !reachedTerminal || effectiveRunOutcome === "blocked") {
      resultSignalShownRef.current = false
      clearResultReadyPulse()
      previousRunStatusRef.current = runStatus
      return
    }

    previousRunStatusRef.current = runStatus

    if (justEnteredTerminal) {
      resultSignalShownRef.current = true
      clearResultReadyPulse()

      if (activeTab === "history") {
        queueResultReadyPulse()
      }

      return
    }

    if (activeTab === "result" || resultSignalShownRef.current) return

    resultSignalShownRef.current = true
    queueResultReadyPulse()
  }, [activeTab, clearResultReadyPulse, effectiveRunOutcome, queueResultReadyPulse, runStatus, showResultSurface])

  useEffect(() => {
    return () => {
      cancelResultReadyPulse()
    }
  }, [cancelResultReadyPulse])

  return {
    activeTab,
    setActiveTab,
    resultReadyPulse,
    openNodeDetails,
    focusStageSurface,
    activateResultSurface,
    handleSurfaceNoticeAction,
  }
}
