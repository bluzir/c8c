import { useEffect } from "react"

import { subscribeDesktopCommands } from "@/lib/desktop-command-bus"
import {
  consumeShortcut,
  isEditableKeyboardTarget,
  isShortcutConsumed,
  matchesPrimaryShortcut,
} from "@/lib/keyboard-shortcuts"

export function useToolbarCommandBindings({
  primaryModifierKey,
  workflowDirty,
  workflowReviewMode,
  isRunning,
  runShortcutEnabled,
  canRun,
  canBatchRun,
  onSave,
  onSaveAs,
  onExport,
  onImport,
  onUndo,
  onRedo,
  onOpenDefaults,
  onToggleChat,
  onRun,
  onRevealRunBlocker,
  onCancel,
  onOpenBatch,
  onOpenSettings,
}: {
  primaryModifierKey: string
  workflowDirty: boolean
  workflowReviewMode: boolean
  isRunning: boolean
  runShortcutEnabled: boolean
  canRun: boolean
  canBatchRun: boolean
  onSave: () => Promise<void> | void
  onSaveAs: () => Promise<void> | void
  onExport: () => Promise<void> | void
  onImport: () => Promise<void> | void
  onUndo: () => void
  onRedo: () => void
  onOpenDefaults: () => void
  onToggleChat: () => void
  onRun: () => Promise<void> | void
  onRevealRunBlocker: () => void
  onCancel: () => Promise<void> | void
  onOpenBatch: () => void
  onOpenSettings: () => void
}) {
  useEffect(() => {
    return subscribeDesktopCommands((commandId) => {
      if (commandId === "file.save") {
        if (workflowDirty) {
          void Promise.resolve(onSave())
        }
        return
      }
      if (commandId === "file.save_as") {
        void Promise.resolve(onSaveAs())
        return
      }
      if (commandId === "file.export") {
        void Promise.resolve(onExport())
        return
      }
      if (commandId === "file.import") {
        void Promise.resolve(onImport())
        return
      }
      if (commandId === "edit.undo") {
        onUndo()
        return
      }
      if (commandId === "edit.redo") {
        onRedo()
        return
      }
      if (commandId === "view.defaults") {
        onOpenDefaults()
        return
      }
      if (commandId === "view.toggle_agent_panel") {
        onToggleChat()
        return
      }
      if (commandId === "flow.run") {
        if (!runShortcutEnabled) return
        if (canRun) {
          void Promise.resolve(onRun())
        } else {
          onRevealRunBlocker()
        }
        return
      }
      if (commandId === "flow.cancel") {
        void Promise.resolve(onCancel())
        return
      }
      if (commandId === "flow.batch_run") {
        if (runShortcutEnabled && canBatchRun) {
          onOpenBatch()
        }
      }
    })
  }, [
    canBatchRun,
    canRun,
    onCancel,
    onExport,
    onImport,
    onOpenBatch,
    onOpenDefaults,
    onRedo,
    onRevealRunBlocker,
    onRun,
    onSave,
    onSaveAs,
    onToggleChat,
    onUndo,
    runShortcutEnabled,
    workflowDirty,
  ])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isShortcutConsumed(event)) return

      const isEditable = isEditableKeyboardTarget(event.target as HTMLElement | null)

      if (matchesPrimaryShortcut(event, { key: "k", primaryModifierKey, shift: true })) {
        event.preventDefault()
        onToggleChat()
        return
      }

      if (matchesPrimaryShortcut(event, { key: ",", primaryModifierKey })) {
        event.preventDefault()
        onOpenSettings()
        return
      }

      if (matchesPrimaryShortcut(event, { key: "s", primaryModifierKey })) {
        event.preventDefault()
        if (workflowDirty) {
          void Promise.resolve(onSave())
        }
        return
      }

      if (isEditable || !matchesPrimaryShortcut(event, { key: "Enter", primaryModifierKey })) return
      if (workflowReviewMode) return
      if (isRunning) {
        consumeShortcut(event)
        void Promise.resolve(onCancel())
      } else if (runShortcutEnabled && canRun) {
        consumeShortcut(event)
        void Promise.resolve(onRun())
      } else if (runShortcutEnabled) {
        consumeShortcut(event)
        onRevealRunBlocker()
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [
    canRun,
    isRunning,
    onCancel,
    onOpenSettings,
    onRevealRunBlocker,
    onRun,
    onSave,
    onToggleChat,
    primaryModifierKey,
    runShortcutEnabled,
    workflowDirty,
    workflowReviewMode,
  ])
}
