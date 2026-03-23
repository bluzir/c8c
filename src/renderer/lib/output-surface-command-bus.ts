import type { OutputSurfaceCommandId } from "@/lib/output-surface-commands"

type OutputSurfaceCommandHandler = (commandId: OutputSurfaceCommandId) => void

const handlers = new Set<OutputSurfaceCommandHandler>()

export function dispatchOutputSurfaceCommand(
  commandId: OutputSurfaceCommandId,
) {
  for (const handler of handlers) {
    handler(commandId)
  }
}

export function subscribeOutputSurfaceCommands(
  handler: OutputSurfaceCommandHandler,
) {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}
