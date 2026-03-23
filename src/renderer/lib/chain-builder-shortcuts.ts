import type { NodeType } from "@shared/types"
import {
  matchesAltShortcut,
  matchesPlainShortcut,
  matchesPrimaryShortcut,
  type KeyboardShortcutEvent,
  type PrimaryModifierKey,
} from "./keyboard-shortcuts"

export type ChainBuilderShortcutIntent =
  | { type: "open_skill_picker" }
  | { type: "select"; nodeId: string }
  | { type: "remove_selected"; nodeId: string }
  | { type: "move_selected"; nodeId: string; direction: "up" | "down" }

export function resolveChainBuilderShortcutIntent({
  event,
  primaryModifierKey,
  flowCardMode,
  isEditable,
  orderedNodeIds,
  resolvedSelectedNodeId,
  selectedNodeId,
  selectedNodeType,
}: {
  event: KeyboardShortcutEvent
  primaryModifierKey: PrimaryModifierKey
  flowCardMode: boolean
  isEditable: boolean
  orderedNodeIds: string[]
  resolvedSelectedNodeId: string | null
  selectedNodeId: string | null
  selectedNodeType: NodeType | null
}): ChainBuilderShortcutIntent | null {
  if (flowCardMode || isEditable) return null

  if (
    matchesPlainShortcut(event, "a") ||
    matchesPrimaryShortcut(event, { key: "a", primaryModifierKey, shift: true })
  ) {
    return { type: "open_skill_picker" }
  }

  if (orderedNodeIds.length > 0) {
    const currentIndex = orderedNodeIds.findIndex(
      (nodeId) => nodeId === resolvedSelectedNodeId,
    )
    if (matchesPlainShortcut(event, "Home")) {
      return { type: "select", nodeId: orderedNodeIds[0] }
    }
    if (matchesPlainShortcut(event, "End")) {
      return {
        type: "select",
        nodeId: orderedNodeIds[orderedNodeIds.length - 1],
      }
    }
    if (matchesPlainShortcut(event, "ArrowUp")) {
      const nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0)
      return { type: "select", nodeId: orderedNodeIds[nextIndex] }
    }
    if (matchesPlainShortcut(event, "ArrowDown")) {
      const nextIndex =
        currentIndex < 0
          ? 0
          : Math.min(currentIndex + 1, orderedNodeIds.length - 1)
      return { type: "select", nodeId: orderedNodeIds[nextIndex] }
    }
  }

  if (!selectedNodeId || !selectedNodeType) return null
  if (selectedNodeType === "input" || selectedNodeType === "output") return null

  if (
    matchesPlainShortcut(event, "Delete") ||
    matchesPlainShortcut(event, "Backspace")
  ) {
    return { type: "remove_selected", nodeId: selectedNodeId }
  }

  if (matchesAltShortcut(event, { key: "ArrowUp" })) {
    return { type: "move_selected", nodeId: selectedNodeId, direction: "up" }
  }

  if (matchesAltShortcut(event, { key: "ArrowDown" })) {
    return { type: "move_selected", nodeId: selectedNodeId, direction: "down" }
  }

  return null
}
