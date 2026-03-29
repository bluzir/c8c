import { useEffect, useRef, useState } from "react"
import type { ChatRun, RunResult } from "@shared/types"
import type { FlowChatMessage } from "@/lib/flow-chat-types"
import type { DecisionContent, ProgressContent } from "@/lib/flow-chat-types"
import { synthesizeTimelineFromRun } from "@/lib/flow-chat-synthesis"

interface UsePastRunTimelineOptions {
  /** Only fetch when true — prevents loading when live flow messages exist */
  enabled: boolean
  /** The latest terminal run to synthesize a timeline for */
  latestRun: RunResult | null
  flowName: string
  /** All runs in the chat — when provided, loads timeline for every run */
  chatRuns?: ChatRun[]
}

/**
 * Post-process persisted messages for display after app restart:
 * - Collapse progress messages into their compact finished-state form
 * - Strip actions from decision messages (the run is terminal, actions are stale)
 */
export function postProcessPersistedMessages(
  messages: FlowChatMessage[],
): FlowChatMessage[] {
  return messages.map((msg) => {
    if (msg.content.type === "progress") {
      const data = msg.content.data as ProgressContent
      if (data.collapsed) return msg
      const doneCount = data.steps.filter((s) => s.status === "done").length
      const elapsed = data.elapsed || ""
      return {
        ...msg,
        content: {
          type: "progress" as const,
          data: {
            ...data,
            collapsed: true,
            collapsedLabel: `${doneCount}/${data.steps.length} steps completed${elapsed ? ` · ${elapsed}` : ""}`,
          },
        },
      }
    }
    if (msg.content.type === "decision") {
      const data = msg.content.data as DecisionContent
      return {
        ...msg,
        content: {
          type: "decision" as const,
          data: { ...data, actions: [] },
        },
      }
    }
    return msg
  })
}

export function usePastRunTimeline(
  options: UsePastRunTimelineOptions,
): FlowChatMessage[] {
  const { enabled, latestRun, flowName, chatRuns } = options
  const [messages, setMessages] = useState<FlowChatMessage[]>([])
  const cachedKeyRef = useRef<string | null>(null)

  // Build a stable cache key from chatRuns or single latestRun
  const cacheKey = chatRuns && chatRuns.length > 0
    ? chatRuns.map((r) => r.runId).join(",")
    : latestRun?.runId ?? null

  useEffect(() => {
    if (!enabled) {
      setMessages([])
      cachedKeyRef.current = null
      return
    }

    // Skip re-fetch if we already have messages for this key
    if (cachedKeyRef.current === cacheKey) return

    let cancelled = false

    // ── Multi-run path: load from every run in the chat ──
    if (chatRuns && chatRuns.length > 0) {
      const loadAllRuns = async () => {
        const allMessages: FlowChatMessage[] = []

        for (let i = 0; i < chatRuns.length; i++) {
          const run = chatRuns[i]
          if (!run.workspace) continue
          try {
            const persisted =
              typeof window.api.loadRunChatTimeline === "function"
                ? await window.api.loadRunChatTimeline(run.workspace)
                : null
            if (
              persisted?.version === 1 &&
              Array.isArray(persisted.messages) &&
              persisted.messages.length > 0
            ) {
              const processed = postProcessPersistedMessages(
                persisted.messages as FlowChatMessage[],
              )
              // Tag each message with runIndex matching its position in chatRuns
              const tagged = processed.map((m) => ({
                ...m,
                runIndex: m.runIndex ?? i,
              }))
              allMessages.push(...tagged)
            }
            // If no persisted timeline, skip (don't synthesize for multi-run)
          } catch {
            // Skip failed loads silently
          }
        }

        if (cancelled) return

        // Sort all messages by timestamp so runs interleave correctly
        allMessages.sort((a, b) => a.timestamp - b.timestamp)

        cachedKeyRef.current = cacheKey
        setMessages(allMessages)
      }

      loadAllRuns().catch((error) => {
        if (cancelled) return
        console.error("[usePastRunTimeline] multi-run load failed:", error)
        setMessages([])
        cachedKeyRef.current = cacheKey
      })

      return () => {
        cancelled = true
      }
    }

    // ── Single-run path (backwards compatibility) ──
    if (!latestRun?.workspace) {
      setMessages([])
      cachedKeyRef.current = null
      return
    }

    // 1. Try loading persisted chat timeline first (guard for pre-rebuild preload)
    const loadTimeline =
      typeof window.api.loadRunChatTimeline === "function"
        ? window.api.loadRunChatTimeline(latestRun.workspace)
        : Promise.resolve(null)

    loadTimeline
      .then((timeline) => {
        if (cancelled) return
        if (timeline && timeline.messages.length > 0) {
          const msgs = postProcessPersistedMessages(
            timeline.messages as FlowChatMessage[],
          )
          cachedKeyRef.current = cacheKey
          setMessages(msgs)
          return
        }

        // 2. Fall back: synthesis from snapshot (for old runs without chat-timeline.json)
        return window.api.loadRunResult(latestRun.workspace).then((loaded) => {
          if (cancelled) return
          if (!loaded?.snapshot) {
            setMessages([])
            cachedKeyRef.current = cacheKey
            return
          }

          const synthesized = synthesizeTimelineFromRun({
            snapshot: loaded.snapshot,
            runResult: latestRun,
            flowName,
          })

          cachedKeyRef.current = cacheKey
          setMessages(synthesized)
        })
      })
      .catch((error) => {
        if (cancelled) return
        console.error("[usePastRunTimeline] load failed:", error)
        setMessages([])
        cachedKeyRef.current = cacheKey
      })

    return () => {
      cancelled = true
    }
  }, [enabled, cacheKey, latestRun?.workspace, flowName, chatRuns])

  return messages
}
