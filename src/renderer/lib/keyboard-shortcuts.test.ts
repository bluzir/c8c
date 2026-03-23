import { describe, expect, it } from "vitest"
import {
  consumeShortcut,
  isEditableKeyboardTarget,
  isShortcutConsumed,
  matchesAltShortcut,
  matchesPlainShortcut,
  matchesPrimaryShortcut,
} from "./keyboard-shortcuts"

function event(overrides: Partial<KeyboardEvent> = {}) {
  const obj: Record<string, unknown> = {
    key: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      obj.defaultPrevented = true
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
    ...overrides,
  }
  return obj as unknown as KeyboardEvent
}

describe("keyboard-shortcuts", () => {
  it("marks consumed shortcuts so later listeners can exit", () => {
    const shortcutEvent = event()

    expect(isShortcutConsumed(shortcutEvent)).toBe(false)

    consumeShortcut(shortcutEvent)

    expect(isShortcutConsumed(shortcutEvent)).toBe(true)
    expect(shortcutEvent.defaultPrevented).toBe(true)
  })

  it("matches exact primary shortcuts without cross-platform modifier bleed", () => {
    expect(
      matchesPrimaryShortcut(
        event({ key: "s", metaKey: true, shiftKey: true }),
        {
          key: "s",
          primaryModifierKey: "meta",
          shift: true,
        },
      ),
    ).toBe(true)

    expect(
      matchesPrimaryShortcut(
        event({ key: "s", ctrlKey: true, shiftKey: true }),
        {
          key: "s",
          primaryModifierKey: "meta",
          shift: true,
        },
      ),
    ).toBe(false)

    expect(
      matchesPrimaryShortcut(event({ key: "s", ctrlKey: true }), {
        key: "s",
        primaryModifierKey: "ctrl",
      }),
    ).toBe(true)
  })

  it("matches only plain shortcuts with no modifiers", () => {
    expect(matchesPlainShortcut(event({ key: "Delete" }), "Delete")).toBe(true)
    expect(
      matchesPlainShortcut(event({ key: "Delete", altKey: true }), "Delete"),
    ).toBe(false)
    expect(matchesPlainShortcut(event({ key: "a", ctrlKey: true }), "a")).toBe(
      false,
    )
  })

  it("matches exact alt shortcuts", () => {
    expect(
      matchesAltShortcut(event({ key: "ArrowUp", altKey: true }), {
        key: "ArrowUp",
      }),
    ).toBe(true)
    expect(
      matchesAltShortcut(
        event({ key: "ArrowUp", altKey: true, shiftKey: true }),
        { key: "ArrowUp" },
      ),
    ).toBe(false)
  })

  it("detects editable keyboard targets", () => {
    const editableDiv = {
      isContentEditable: true,
      tagName: "DIV",
      closest: () => null,
    } as unknown as HTMLElement

    const textarea = {
      isContentEditable: false,
      tagName: "TEXTAREA",
      closest: () => null,
    } as unknown as HTMLElement

    const nestedEditor = {
      isContentEditable: false,
      tagName: "DIV",
      closest: (selector: string) =>
        selector === "[contenteditable=true]" ? {} : null,
    } as unknown as HTMLElement

    expect(isEditableKeyboardTarget(editableDiv)).toBe(true)
    expect(isEditableKeyboardTarget(textarea)).toBe(true)
    expect(isEditableKeyboardTarget(nestedEditor)).toBe(true)
    expect(isEditableKeyboardTarget({} as EventTarget)).toBe(false)
    expect(isEditableKeyboardTarget(null)).toBe(false)
  })
})
