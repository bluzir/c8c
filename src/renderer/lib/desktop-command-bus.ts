import type { DesktopCommandId } from "@shared/desktop-commands"

const DESKTOP_COMMAND_EVENT = "c8c:desktop-command"

export function dispatchDesktopCommand(commandId: DesktopCommandId): void {
  window.dispatchEvent(
    new CustomEvent<DesktopCommandId>(DESKTOP_COMMAND_EVENT, {
      detail: commandId,
    }),
  )
}

export function subscribeDesktopCommands(
  handler: (commandId: DesktopCommandId) => void,
): () => void {
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<DesktopCommandId>
    handler(customEvent.detail)
  }

  window.addEventListener(DESKTOP_COMMAND_EVENT, listener)
  return () => {
    window.removeEventListener(DESKTOP_COMMAND_EVENT, listener)
  }
}
