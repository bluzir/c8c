import { describe, expect, it } from "vitest"
import { resolveAppShellShortcutIntent } from "./app-shell-shortcuts"

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

describe("resolveAppShellShortcutIntent", () => {
  it("opens attach skill only on the exact primary-shift shortcut", () => {
    expect(
      resolveAppShellShortcutIntent({
        event: event({ key: "s", metaKey: true, shiftKey: true }),
        primaryModifierKey: "meta",
        isEditable: false,
        quickSwitchCount: 5,
      }),
    ).toEqual({ type: "attach_skill" })

    expect(
      resolveAppShellShortcutIntent({
        event: event({ key: "s", ctrlKey: true, shiftKey: true }),
        primaryModifierKey: "meta",
        isEditable: false,
        quickSwitchCount: 5,
      }),
    ).toBeNull()
  })

  it("blocks attach skill and quick switch from editable targets", () => {
    expect(
      resolveAppShellShortcutIntent({
        event: event({ key: "s", ctrlKey: true, shiftKey: true }),
        primaryModifierKey: "ctrl",
        isEditable: true,
        quickSwitchCount: 5,
      }),
    ).toBeNull()

    expect(
      resolveAppShellShortcutIntent({
        event: event({ key: "2", ctrlKey: true }),
        primaryModifierKey: "ctrl",
        isEditable: true,
        quickSwitchCount: 5,
      }),
    ).toBeNull()
  })

  it("routes quick switch by rail index", () => {
    expect(
      resolveAppShellShortcutIntent({
        event: event({ key: "2", ctrlKey: true }),
        primaryModifierKey: "ctrl",
        isEditable: false,
        quickSwitchCount: 5,
      }),
    ).toEqual({ type: "quick_switch", index: 1 })

    expect(
      resolveAppShellShortcutIntent({
        event: event({ key: "4", ctrlKey: true }),
        primaryModifierKey: "ctrl",
        isEditable: false,
        quickSwitchCount: 2,
      }),
    ).toBeNull()
  })

  it("keeps global shell shortcuts available when text focus is inside an editor", () => {
    expect(
      resolveAppShellShortcutIntent({
        event: event({ key: ",", metaKey: true }),
        primaryModifierKey: "meta",
        isEditable: true,
        quickSwitchCount: 5,
      }),
    ).toEqual({ type: "open_settings" })

    expect(
      resolveAppShellShortcutIntent({
        event: event({ key: "k", metaKey: true, shiftKey: true }),
        primaryModifierKey: "meta",
        isEditable: true,
        quickSwitchCount: 5,
      }),
    ).toEqual({ type: "toggle_thread" })
  })
})
