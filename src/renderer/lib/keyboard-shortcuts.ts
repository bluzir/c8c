const SHORTCUT_CONSUMED = Symbol("c8c.shortcutConsumed")

export type PrimaryModifierKey = "meta" | "ctrl"

type ShortcutEvent = KeyboardEvent & {
  [SHORTCUT_CONSUMED]?: boolean
}

export interface KeyboardShortcutEvent {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  defaultPrevented?: boolean
}

function isHtmlElementLike(target: EventTarget | null): target is HTMLElement {
  return Boolean(
    target &&
    typeof target === "object" &&
    "tagName" in target &&
    typeof (target as { tagName?: unknown }).tagName === "string",
  )
}

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!isHtmlElementLike(target)) {
    return false
  }

  const tagName = target.tagName
  return Boolean(
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    (typeof target.closest === "function"
      ? target.closest("[contenteditable=true]")
      : null),
  )
}

export function isShortcutConsumed(event: KeyboardEvent) {
  return Boolean((event as ShortcutEvent)[SHORTCUT_CONSUMED])
}

export function consumeShortcut(event: KeyboardEvent) {
  const shortcutEvent = event as ShortcutEvent
  shortcutEvent[SHORTCUT_CONSUMED] = true
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

export function usesPrimaryModifier(
  event: KeyboardShortcutEvent,
  primaryModifierKey: PrimaryModifierKey,
) {
  return primaryModifierKey === "meta" ? event.metaKey : event.ctrlKey
}

export function matchesPrimaryShortcut(
  event: KeyboardShortcutEvent,
  {
    key,
    primaryModifierKey,
    shift = false,
  }: {
    key: string
    primaryModifierKey: PrimaryModifierKey
    shift?: boolean
  },
) {
  if (event.defaultPrevented) return false
  if (event.key.toLowerCase() !== key.toLowerCase()) return false
  if (event.altKey || event.shiftKey !== shift) return false
  if (!usesPrimaryModifier(event, primaryModifierKey)) return false
  if (primaryModifierKey === "meta" && event.ctrlKey) return false
  if (primaryModifierKey === "ctrl" && event.metaKey) return false
  return true
}

export function matchesPlainShortcut(
  event: KeyboardShortcutEvent,
  key: string,
) {
  if (event.defaultPrevented) return false
  if (event.key.toLowerCase() !== key.toLowerCase()) return false
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
}

export function matchesAltShortcut(
  event: KeyboardShortcutEvent,
  {
    key,
    shift = false,
  }: {
    key: string
    shift?: boolean
  },
) {
  if (event.defaultPrevented) return false
  if (event.key.toLowerCase() !== key.toLowerCase()) return false
  return (
    event.altKey && !event.ctrlKey && !event.metaKey && event.shiftKey === shift
  )
}
