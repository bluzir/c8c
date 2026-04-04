import { useState, useCallback, useRef } from "react"
import { useSetAtom } from "jotai"
import type { RoutingIntent, RoutingEvent } from "@shared/routing-types"
import { commitEnvelopeAtom } from "@/lib/commit-envelope"
import {
  chatRoutingProgressAtom,
  chatFlowInputRequestAtom,
} from "@/lib/store"
import { errorToUserMessage } from "@/lib/error-message"

/**
 * Strip the Electron IPC error prefix that wraps remote errors.
 * Delegates to the shared `errorToUserMessage` and then removes the
 * `Error: Error invoking remote method '...': Error: ` wrapper.
 */
function cleanIpcError(error: unknown): string {
  return errorToUserMessage(error).replace(
    /^Error: Error invoking remote method '[^']+': Error: /,
    "",
  )
}

export function useRoutingTransaction() {
  const commitEnvelope = useSetAtom(commitEnvelopeAtom)
  const setChatRoutingProgress = useSetAtom(chatRoutingProgressAtom)
  const setChatFlowInputRequest = useSetAtom(chatFlowInputRequestAtom)
  const [dispatching, setDispatching] = useState(false)
  const activeSessionRef = useRef<string | null>(null)

  const dispatch = useCallback(
    (intent: RoutingIntent) => {
      if (dispatching) return
      setDispatching(true)

      const sessionId = `routing-${Date.now()}-${Math.random().toString(36).slice(2)}`
      activeSessionRef.current = sessionId

      // Show initial routing progress
      setChatRoutingProgress({
        phase: "inspecting",
        userRequest: intent.requestedResult,
      })

      // Subscribe to routing events from this session
      const unsubscribe = window.api.onRoutingEvent((event: RoutingEvent) => {
        if (event.sessionId !== sessionId) return
        if (activeSessionRef.current !== sessionId) return

        switch (event.type) {
          case "route_selected":
            setChatRoutingProgress({
              phase: "opening",
              userRequest: intent.requestedResult,
              templateName: event.templateName,
            })
            break
          case "route_clarification":
            setChatRoutingProgress({
              phase: "clarifying",
              userRequest: intent.requestedResult,
              clarification: event.clarification,
            })
            setDispatching(false)
            break
          case "routing_failed":
            setChatRoutingProgress({
              phase: "error",
              userRequest: intent.requestedResult,
              errorMessage: event.error,
            })
            setDispatching(false)
            break
        }
      })

      window.api
        .routeIntent(intent, { sessionId })
        .then((envelope) => {
          if (activeSessionRef.current !== sessionId) return
          // Atomic commit — sets all atoms at once
          commitEnvelope(envelope)
          // Auto-run if the envelope says so (follow-ups)
          if (envelope.autoRun) {
            setChatFlowInputRequest({ kind: "run" })
          }
        })
        .catch((error: unknown) => {
          if (activeSessionRef.current !== sessionId) return
          setChatRoutingProgress({
            phase: "error",
            userRequest: intent.requestedResult,
            errorMessage: cleanIpcError(error),
          })
        })
        .finally(() => {
          unsubscribe()
          if (activeSessionRef.current === sessionId) {
            setDispatching(false)
          }
        })
    },
    [dispatching, commitEnvelope, setChatRoutingProgress, setChatFlowInputRequest],
  )

  const cancel = useCallback(() => {
    const sessionId = activeSessionRef.current
    if (sessionId) {
      void window.api.cancelRouting(sessionId)
      activeSessionRef.current = null
      setDispatching(false)
      setChatRoutingProgress(null)
    }
  }, [setChatRoutingProgress])

  return { dispatch, cancel, dispatching }
}
