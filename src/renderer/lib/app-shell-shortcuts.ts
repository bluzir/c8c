import {
  matchesPrimaryShortcut,
  type KeyboardShortcutEvent,
  type PrimaryModifierKey,
} from "./keyboard-shortcuts"

export type AppShellShortcutIntent =
  | { type: "open_settings" }
  | { type: "toggle_command_palette" }
  | { type: "new_flow" }
  | { type: "attach_skill" }
  | { type: "quick_switch"; index: number }
  | { type: "toggle_thread" }
  | { type: "toggle_sidebar" }

export function resolveAppShellShortcutIntent({
  event,
  primaryModifierKey,
  isEditable,
  quickSwitchCount,
}: {
  event: KeyboardShortcutEvent
  primaryModifierKey: PrimaryModifierKey
  isEditable: boolean
  quickSwitchCount: number
}): AppShellShortcutIntent | null {
  if (matchesPrimaryShortcut(event, { key: ",", primaryModifierKey })) {
    return { type: "open_settings" }
  }

  if (matchesPrimaryShortcut(event, { key: "k", primaryModifierKey })) {
    return { type: "toggle_command_palette" }
  }

  if (matchesPrimaryShortcut(event, { key: "n", primaryModifierKey })) {
    return { type: "new_flow" }
  }

  if (
    !isEditable &&
    matchesPrimaryShortcut(event, { key: "s", primaryModifierKey, shift: true })
  ) {
    return { type: "attach_skill" }
  }

  if (!isEditable && /^[1-5]$/.test(event.key)) {
    const index = Number(event.key) - 1
    if (
      index < quickSwitchCount &&
      matchesPrimaryShortcut(event, { key: event.key, primaryModifierKey })
    ) {
      return { type: "quick_switch", index }
    }
  }

  if (
    matchesPrimaryShortcut(event, { key: "k", primaryModifierKey, shift: true })
  ) {
    return { type: "toggle_thread" }
  }

  if (
    !isEditable &&
    matchesPrimaryShortcut(event, { key: "b", primaryModifierKey })
  ) {
    return { type: "toggle_sidebar" }
  }

  return null
}
