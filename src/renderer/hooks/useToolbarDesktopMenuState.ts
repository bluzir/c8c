import { useEffect, useMemo } from "react"
import { useSetAtom } from "jotai"
import { createDefaultDesktopMenuState } from "@shared/desktop-commands"

import {
  desktopMenuStateAtom,
  type FlowSurfaceMode,
  type ViewMode,
} from "@/lib/store"

export function useToolbarDesktopMenuState({
  runStatus,
  workflowReviewMode,
  isRunning,
  isSaving,
  workflowDirty,
  canUndo,
  canRedo,
  viewMode,
  flowSurfaceMode,
  chatOpen,
  runShortcutEnabled,
  canRun,
  canBatchRun,
  workflowPastRunsCount,
  canRerunFromStep,
}: {
  runStatus: string
  workflowReviewMode: boolean
  isRunning: boolean
  isSaving: boolean
  workflowDirty: boolean
  canUndo: boolean
  canRedo: boolean
  viewMode: ViewMode
  flowSurfaceMode: FlowSurfaceMode
  chatOpen: boolean
  runShortcutEnabled: boolean
  canRun: boolean
  canBatchRun: boolean
  workflowPastRunsCount: number
  canRerunFromStep: boolean
}) {
  const setDesktopMenuState = useSetAtom(desktopMenuStateAtom)

  const desktopMenuState = useMemo(() => {
    const canEditStructure = runStatus === "idle" && !workflowReviewMode
    return {
      file: {
        save: { enabled: !isRunning && !isSaving && workflowDirty },
        saveAs: { enabled: !isRunning },
        export: { enabled: !isRunning },
        import: { enabled: !isRunning },
      },
      edit: {
        undo: { enabled: canEditStructure && canUndo },
        redo: { enabled: canEditStructure && canRedo },
      },
      view: {
        defaults: {
          enabled: canEditStructure,
          checked: canEditStructure && viewMode === "settings",
        },
        editFlow: {
          enabled: canEditStructure,
          checked:
            canEditStructure &&
            viewMode === "list" &&
            flowSurfaceMode === "edit",
        },
        toggleAgentPanel: {
          enabled: true,
          checked: chatOpen,
        },
      },
      flow: {
        run: {
          enabled: runShortcutEnabled && canRun,
          visible: runShortcutEnabled,
        },
        runAgain: {
          enabled: runStatus === "idle" && workflowPastRunsCount > 0,
        },
        rerunFromStep: {
          enabled: runStatus === "idle" && canRerunFromStep,
        },
        cancel: {
          enabled: isRunning,
          visible: isRunning,
        },
        batchRun: {
          enabled: runShortcutEnabled && canBatchRun,
        },
        history: {
          enabled: runStatus === "idle" && workflowPastRunsCount > 0,
        },
      },
    }
  }, [
    canBatchRun,
    canRedo,
    canRun,
    canRerunFromStep,
    canUndo,
    chatOpen,
    flowSurfaceMode,
    isRunning,
    isSaving,
    runShortcutEnabled,
    runStatus,
    viewMode,
    workflowDirty,
    workflowPastRunsCount,
    workflowReviewMode,
  ])

  useEffect(() => {
    setDesktopMenuState(desktopMenuState)
  }, [desktopMenuState, setDesktopMenuState])

  useEffect(() => {
    return () => {
      setDesktopMenuState(createDefaultDesktopMenuState())
    }
  }, [setDesktopMenuState])
}
