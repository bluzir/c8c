import { describe, expect, it } from "vitest"
import { resolveChainBuilderShortcutIntent } from "./chain-builder-shortcuts"

function event(overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    ...overrides,
  } as KeyboardEvent
}

describe("resolveChainBuilderShortcutIntent", () => {
  it("opens the skill picker from the exact add-step shortcuts", () => {
    expect(
      resolveChainBuilderShortcutIntent({
        event: event({ key: "a" }),
        primaryModifierKey: "meta",
        flowCardMode: false,
        isEditable: false,
        orderedNodeIds: ["input-1", "skill-1", "output-1"],
        resolvedSelectedNodeId: "skill-1",
        selectedNodeId: "skill-1",
        selectedNodeType: "skill",
      }),
    ).toEqual({ type: "open_skill_picker" })

    expect(
      resolveChainBuilderShortcutIntent({
        event: event({ key: "a", ctrlKey: true }),
        primaryModifierKey: "meta",
        flowCardMode: false,
        isEditable: false,
        orderedNodeIds: ["input-1", "skill-1", "output-1"],
        resolvedSelectedNodeId: "skill-1",
        selectedNodeId: "skill-1",
        selectedNodeType: "skill",
      }),
    ).toBeNull()
  })

  it("navigates across ordered steps with home/end/arrows", () => {
    expect(
      resolveChainBuilderShortcutIntent({
        event: event({ key: "Home" }),
        primaryModifierKey: "ctrl",
        flowCardMode: false,
        isEditable: false,
        orderedNodeIds: ["input-1", "skill-1", "output-1"],
        resolvedSelectedNodeId: "skill-1",
        selectedNodeId: "skill-1",
        selectedNodeType: "skill",
      }),
    ).toEqual({ type: "select", nodeId: "input-1" })

    expect(
      resolveChainBuilderShortcutIntent({
        event: event({ key: "ArrowDown" }),
        primaryModifierKey: "ctrl",
        flowCardMode: false,
        isEditable: false,
        orderedNodeIds: ["input-1", "skill-1", "output-1"],
        resolvedSelectedNodeId: null,
        selectedNodeId: null,
        selectedNodeType: null,
      }),
    ).toEqual({ type: "select", nodeId: "input-1" })
  })

  it("removes only editable selected steps", () => {
    expect(
      resolveChainBuilderShortcutIntent({
        event: event({ key: "Delete" }),
        primaryModifierKey: "ctrl",
        flowCardMode: false,
        isEditable: false,
        orderedNodeIds: ["input-1", "skill-1", "output-1"],
        resolvedSelectedNodeId: "skill-1",
        selectedNodeId: "skill-1",
        selectedNodeType: "skill",
      }),
    ).toEqual({ type: "remove_selected", nodeId: "skill-1" })

    expect(
      resolveChainBuilderShortcutIntent({
        event: event({ key: "Delete" }),
        primaryModifierKey: "ctrl",
        flowCardMode: false,
        isEditable: false,
        orderedNodeIds: ["input-1", "output-1"],
        resolvedSelectedNodeId: "output-1",
        selectedNodeId: "output-1",
        selectedNodeType: "output",
      }),
    ).toBeNull()
  })

  it("moves only on the exact alt-arrow shortcut", () => {
    expect(
      resolveChainBuilderShortcutIntent({
        event: event({ key: "ArrowUp", altKey: true }),
        primaryModifierKey: "ctrl",
        flowCardMode: false,
        isEditable: false,
        orderedNodeIds: ["input-1", "skill-1", "output-1"],
        resolvedSelectedNodeId: "skill-1",
        selectedNodeId: "skill-1",
        selectedNodeType: "skill",
      }),
    ).toEqual({ type: "move_selected", nodeId: "skill-1", direction: "up" })

    expect(
      resolveChainBuilderShortcutIntent({
        event: event({ key: "ArrowUp", altKey: true, shiftKey: true }),
        primaryModifierKey: "ctrl",
        flowCardMode: false,
        isEditable: false,
        orderedNodeIds: ["input-1", "skill-1", "output-1"],
        resolvedSelectedNodeId: "skill-1",
        selectedNodeId: "skill-1",
        selectedNodeType: "skill",
      }),
    ).toBeNull()
  })

  it("disables builder shortcuts in flow-card mode", () => {
    expect(
      resolveChainBuilderShortcutIntent({
        event: event({ key: "a" }),
        primaryModifierKey: "ctrl",
        flowCardMode: true,
        isEditable: false,
        orderedNodeIds: ["input-1", "skill-1", "output-1"],
        resolvedSelectedNodeId: "skill-1",
        selectedNodeId: "skill-1",
        selectedNodeType: "skill",
      }),
    ).toBeNull()
  })
})
