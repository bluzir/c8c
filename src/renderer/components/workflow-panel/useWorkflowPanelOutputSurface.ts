import { useCallback, useEffect, useState } from "react"

import type { MainView } from "@/lib/store"
import { toastError } from "@/lib/toast-error"
import type { ExecutionSurfaceNotice } from "@/lib/workflow-execution"
import type { ArtifactRecord } from "@shared/types"

interface OutputTabRequest {
  tab: "nodes" | "log" | "result" | "history"
  nodeId?: string
  nonce: number
}

export function useWorkflowPanelOutputSurface({
  showBlockedResumeHeader,
  blockedTaskKey,
  canShowTerminalResultSurface,
  showAnyReviewMode,
  runStatus,
  surfaceNotice,
  outputPanelRef,
  scrollOutputPanelIntoListViewport,
  setMainView,
  setSurfaceNotice,
  setViewMode,
  setOutputTabRequest,
}: {
  showBlockedResumeHeader: boolean
  blockedTaskKey: string | null
  canShowTerminalResultSurface: boolean
  showAnyReviewMode: boolean
  runStatus: string
  surfaceNotice: ExecutionSurfaceNotice | null
  outputPanelRef: React.MutableRefObject<HTMLDivElement | null>
  scrollOutputPanelIntoListViewport: (padding?: number) => boolean
  setMainView: (value: MainView) => void
  setSurfaceNotice: (value: ExecutionSurfaceNotice | null) => void
  setViewMode: (value: "list" | "settings") => void
  setOutputTabRequest: (value: OutputTabRequest) => void
}) {
  const [blockedInspectionVisible, setBlockedInspectionVisible] =
    useState(false)

  const requestOutputTab = useCallback(
    (tab: "nodes" | "log" | "result" | "history", nodeId?: string) => {
      setViewMode("list")
      if (showBlockedResumeHeader) {
        setBlockedInspectionVisible(true)
      }
      setOutputTabRequest({ tab, nodeId, nonce: Date.now() })
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (scrollOutputPanelIntoListViewport()) {
            return
          }
          outputPanelRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          })
        })
      })
    },
    [
      outputPanelRef,
      scrollOutputPanelIntoListViewport,
      setOutputTabRequest,
      setViewMode,
      showBlockedResumeHeader,
    ],
  )

  useEffect(() => {
    setBlockedInspectionVisible(false)
  }, [blockedTaskKey, showBlockedResumeHeader])

  const openActivity = useCallback(() => {
    requestOutputTab("nodes")
  }, [requestOutputTab])

  const openResult = useCallback(() => {
    requestOutputTab(canShowTerminalResultSurface ? "result" : "nodes")
  }, [canShowTerminalResultSurface, requestOutputTab])

  const handleSurfaceNoticeAction = useCallback(() => {
    if (!surfaceNotice) return
    if (surfaceNotice.actionTarget === "result") {
      openResult()
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "activity") {
      openActivity()
      setSurfaceNotice(null)
      return
    }
    if (surfaceNotice.actionTarget === "inbox") {
      setMainView("inbox")
      setSurfaceNotice(null)
    }
  }, [openActivity, openResult, setMainView, setSurfaceNotice, surfaceNotice])

  const focusStageDetails = useCallback(
    ({
      nodeId,
      preferredTab,
    }: {
      nodeId: string
      preferredTab: "nodes" | "log" | "result"
    }) => {
      if (runStatus === "idle" && !showAnyReviewMode) return
      requestOutputTab(preferredTab, nodeId)
    },
    [requestOutputTab, runStatus, showAnyReviewMode],
  )

  const handleOpenArtifact = useCallback(async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toastError("Could not open result", {
      description: openError,
    })
  }, [])

  return {
    blockedInspectionVisible,
    requestOutputTab,
    openResult,
    handleSurfaceNoticeAction,
    focusStageDetails,
    handleOpenArtifact,
  }
}
