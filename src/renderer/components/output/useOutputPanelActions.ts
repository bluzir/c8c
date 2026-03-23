import { useCallback } from "react"

import type { ArtifactRecord } from "@shared/types"

import { toastError, toastErrorFromCatch } from "@/lib/toast-error"

export function useOutputPanelActions({
  canCopyResult,
  resultCopyTextWithHeader,
  onOpenReport,
}: {
  canCopyResult: boolean
  resultCopyTextWithHeader: string
  onOpenReport: (path: string) => void | Promise<void>
}) {
  const handleCopyResult = useCallback(async () => {
    if (!canCopyResult) return
    try {
      await navigator.clipboard.writeText(resultCopyTextWithHeader)
    } catch (error) {
      console.error("[OutputPanel] copy result failed:", error)
      toastErrorFromCatch("Could not copy result", error)
    }
  }, [canCopyResult, resultCopyTextWithHeader])

  const handleOpenReport = useCallback(
    async (path: string) => {
      try {
        await Promise.resolve(onOpenReport(path))
      } catch (error) {
        console.error("[OutputPanel] open report failed:", error)
        toastErrorFromCatch("Could not open report file", error)
      }
    },
    [onOpenReport],
  )

  const handleOpenArtifact = useCallback(async (artifact: ArtifactRecord) => {
    const openError = await window.api.openPath(artifact.contentPath)
    if (!openError) return
    toastError("Could not open file", {
      description: openError,
    })
  }, [])

  const handleCopyArtifactPath = useCallback(
    async (artifact: ArtifactRecord) => {
      try {
        await navigator.clipboard.writeText(artifact.contentPath)
      } catch (error) {
        console.error("[OutputPanel] copy artifact path failed:", error)
        toastErrorFromCatch("Could not copy file path", error)
      }
    },
    [],
  )

  return {
    handleCopyResult,
    handleOpenReport,
    handleOpenArtifact,
    handleCopyArtifactPath,
  }
}
