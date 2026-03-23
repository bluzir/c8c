import { useEffect } from "react"

import { useSetAtom } from "jotai"

import type { OutputTabValue } from "@/components/output/outputPanelTypes"
import { subscribeDesktopCommands } from "@/lib/desktop-command-bus"
import {
  consumeShortcut,
  isEditableKeyboardTarget,
  isShortcutConsumed,
  matchesPrimaryShortcut,
  type PrimaryModifierKey,
} from "@/lib/keyboard-shortcuts"
import { createDefaultOutputSurfaceCommandState } from "@/lib/output-surface-commands"
import { subscribeOutputSurfaceCommands } from "@/lib/output-surface-command-bus"
import { outputSurfaceCommandStateAtom } from "@/lib/store"

export function useOutputPanelCommandBindings({
  primaryModifierKey,
  activeTab,
  showResultSurface,
  canInspectActivity,
  canInspectLog,
  canInspectHistory,
  canRerunSelectedStage,
  reviewingRunHistory,
  selectedStageId,
  showArtifactContinuation,
  canTriggerNextStageShortcut,
  onRunNextStage,
  onUseInNewFlow,
  onActivateResultSurface,
  onFocusStageSurface,
  onOpenHistory,
  onRerunFrom,
}: {
  primaryModifierKey: PrimaryModifierKey
  activeTab: OutputTabValue
  showResultSurface: boolean
  canInspectActivity: boolean
  canInspectLog: boolean
  canInspectHistory: boolean
  canRerunSelectedStage: boolean
  reviewingRunHistory: boolean
  selectedStageId: string | null
  showArtifactContinuation: boolean
  canTriggerNextStageShortcut: boolean
  onRunNextStage?: (() => Promise<void> | void) | null
  onUseInNewFlow?: (() => Promise<void> | void) | null
  onActivateResultSurface: () => void
  onFocusStageSurface: (tab: "nodes") => void
  onOpenHistory: () => void
  onRerunFrom: (nodeId: string) => void
}) {
  const setOutputSurfaceCommandState = useSetAtom(outputSurfaceCommandStateAtom)

  useEffect(() => {
    setOutputSurfaceCommandState({
      result: showResultSurface,
      activity: canInspectActivity,
      log: canInspectLog,
      history: canInspectHistory,
      rerunFromStep: Boolean(selectedStageId && canRerunSelectedStage),
      useInNewFlow: Boolean(
        onUseInNewFlow && showResultSurface && !reviewingRunHistory,
      ),
    })

    return () => {
      setOutputSurfaceCommandState(createDefaultOutputSurfaceCommandState())
    }
  }, [
    canInspectActivity,
    canInspectHistory,
    canInspectLog,
    canRerunSelectedStage,
    onUseInNewFlow,
    reviewingRunHistory,
    selectedStageId,
    setOutputSurfaceCommandState,
    showResultSurface,
  ])

  useEffect(() => {
    return subscribeOutputSurfaceCommands((commandId) => {
      if (commandId === "output.view_result" && showResultSurface) {
        onActivateResultSurface()
        return
      }
      if (commandId === "output.view_activity" && canInspectActivity) {
        onFocusStageSurface("nodes")
        return
      }
      if (commandId === "output.view_log" && canInspectLog) {
        onFocusStageSurface("nodes")
        return
      }
      if (commandId === "output.view_history" && canInspectHistory) {
        onOpenHistory()
        return
      }
      if (
        commandId === "output.rerun_from_step" &&
        selectedStageId &&
        canRerunSelectedStage
      ) {
        onRerunFrom(selectedStageId)
        return
      }
      if (commandId === "output.use_in_new_flow" && onUseInNewFlow) {
        void Promise.resolve(onUseInNewFlow())
      }
    })
  }, [
    canInspectActivity,
    canInspectHistory,
    canInspectLog,
    canRerunSelectedStage,
    onActivateResultSurface,
    onFocusStageSurface,
    onOpenHistory,
    onRerunFrom,
    onUseInNewFlow,
    selectedStageId,
    showResultSurface,
  ])

  useEffect(() => {
    return subscribeDesktopCommands((commandId) => {
      if (
        commandId === "flow.rerun_from_step" &&
        selectedStageId &&
        canRerunSelectedStage
      ) {
        onRerunFrom(selectedStageId)
      }
    })
  }, [canRerunSelectedStage, onRerunFrom, selectedStageId])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return
      if (isEditableKeyboardTarget(event.target as HTMLElement | null)) return
      if (!matchesPrimaryShortcut(event, { key: "Enter", primaryModifierKey }))
        return

      if (
        activeTab === "result" &&
        showArtifactContinuation &&
        canTriggerNextStageShortcut &&
        onRunNextStage
      ) {
        consumeShortcut(event)
        void Promise.resolve(onRunNextStage())
      }
    }

    window.addEventListener("keydown", handler, true)
    return () => {
      window.removeEventListener("keydown", handler, true)
    }
  }, [
    activeTab,
    canTriggerNextStageShortcut,
    onRunNextStage,
    primaryModifierKey,
    showArtifactContinuation,
  ])
}
