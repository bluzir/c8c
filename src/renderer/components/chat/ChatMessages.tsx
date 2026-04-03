import { useCallback, useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import { useAtomValue, useSetAtom } from "jotai"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { FlowDecisionMessage } from "./FlowDecisionMessage"
import { FlowCompleteMessage } from "./FlowCompleteMessage"
import { FlowErrorMessage } from "./FlowErrorMessage"
import { FlowStartMessage } from "./FlowStartMessage"
import { FlowProgressMessage } from "./FlowProgressMessage"
import {
  FlowRoutingMessage,
  type ClarificationSelection,
} from "./FlowRoutingMessage"
import { StepNarrativeItem } from "./StepNarrativeItem"
import { cn } from "@/lib/cn"
import { ArrowDown, Clock } from "lucide-react"
import type { TimelineEntry } from "@/hooks/useFlowChatTimeline"

const FIVE_MINUTES_MS = 5 * 60 * 1000

function getEntryTimestamp(entry: TimelineEntry): number {
  return entry.kind === "flow"
    ? entry.message.timestamp
    : entry.message.timestamp
}

function formatTimeGap(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  if (isToday) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPastRunDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`
}

import {
  chatFlowInputRequestAtom,
  chatRoutingProgressAtom,
  chatScrollTopByWorkflowAtom,
  selectedProjectAtom,
  selectedWorkflowPathAtom,
  type ChatMessageDisplay,
} from "@/lib/store"
import {
  resolvedDecisionIdsAtom,
  resolveFlowChatDecisionAtom,
} from "@/features/execution/flow-chat-state"
import { workflowHistoryRunsAtom } from "@/features/execution/state"
import type { FlowFollowUp } from "@/lib/flow-chat-types"
import { useFlowChatTimeline } from "@/hooks/useFlowChatTimeline"

interface ChatMessagesProps {
  messages: ChatMessageDisplay[]
  status: "idle" | "thinking" | "streaming" | "error"
  onSelectClarification?: (selection: ClarificationSelection) => void
  onFollowUp?: (followUp: FlowFollowUp) => void
  onUseInNewFlow?: () => void
  followUpDisabled?: boolean
  routeAlternatives?: import("./FlowRoutingMessage").RouteAlternativeOption[]
  pendingRouteAlternativeId?: string | null
  onSelectRouteAlternative?: (templateId: string) => void
  onCancel?: () => void
}

export function ChatMessages({
  messages,
  status,
  onSelectClarification,
  onFollowUp,
  onUseInNewFlow,
  followUpDisabled,
  routeAlternatives,
  pendingRouteAlternativeId,
  onSelectRouteAlternative,
  onCancel,
}: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const lastSeenCountRef = useRef(0)
  const [scrollIndicator, setScrollIndicator] = useState<
    "hidden" | "new" | "scroll"
  >("hidden")
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [chatScrollTopByWorkflow, setChatScrollTopByWorkflow] = useAtom(
    chatScrollTopByWorkflowAtom,
  )
  const resolvedIds = useAtomValue(resolvedDecisionIdsAtom)
  const resolveDecision = useSetAtom(resolveFlowChatDecisionAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  const setChatFlowInputRequest = useSetAtom(chatFlowInputRequestAtom)
  const setChatRoutingProgress = useSetAtom(chatRoutingProgressAtom)
  const historyRuns = useAtomValue(workflowHistoryRunsAtom)

  const { timeline, flowMessages, entryState, pastRunMeta } = useFlowChatTimeline(messages)

  const handleRunFromRouting = useCallback(() => {
    setChatFlowInputRequest({ kind: "run" })
  }, [setChatFlowInputRequest])
  const handleRetry = useCallback(
    (nodeId?: string) => {
      if (nodeId) {
        // Recover workspace from history runs (needed after app restart when
        // the in-memory workspace atom is empty).
        const latestTerminalRun = historyRuns.find(
          (r) => r.status === "failed" || r.status === "completed",
        )
        setChatFlowInputRequest({
          kind: "rerun",
          fromNodeId: nodeId,
          workspace: latestTerminalRun?.workspace ?? null,
        })
      } else {
        setChatFlowInputRequest({ kind: "run" })
      }
    },
    [setChatFlowInputRequest, historyRuns],
  )
  const handleContinue = useCallback(
    (runId: string) => {
      setChatFlowInputRequest({ kind: "continue", runId })
    },
    [setChatFlowInputRequest],
  )
  const handleRetryRouting = useCallback(() => {
    setChatRoutingProgress(null)
  }, [setChatRoutingProgress])
  const hasRouteAlternatives = Boolean(
    routeAlternatives && routeAlternatives.length > 0,
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let saveTimer: ReturnType<typeof setTimeout> | null = null
    const handleScroll = () => {
      const threshold = 80
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      isNearBottomRef.current = nearBottom
      if (nearBottom) {
        lastSeenCountRef.current = timeline.length
        setScrollIndicator("hidden")
      }
      // Debounce scroll position persistence (200ms)
      if (selectedWorkflowPath) {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          setChatScrollTopByWorkflow((prev) => ({
            ...prev,
            [selectedWorkflowPath]: el.scrollTop,
          }))
        }, 200)
      }
    }

    el.addEventListener("scroll", handleScroll)
    return () => {
      el.removeEventListener("scroll", handleScroll)
      if (saveTimer) clearTimeout(saveTimer)
    }
  }, [selectedWorkflowPath, setChatScrollTopByWorkflow, timeline.length])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    lastSeenCountRef.current = timeline.length
    setScrollIndicator("hidden")
    const savedScrollTop = selectedWorkflowPath
      ? chatScrollTopByWorkflow[selectedWorkflowPath]
      : null
    if (typeof savedScrollTop === "number" && savedScrollTop > 0) {
      el.scrollTop = savedScrollTop
      isNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 80
      return
    }
    el.scrollTop = el.scrollHeight
    isNearBottomRef.current = true
  }, [selectedWorkflowPath])

  // Auto-scroll when new messages arrive or content streams
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight
      lastSeenCountRef.current = timeline.length
      if (selectedWorkflowPath) {
        setChatScrollTopByWorkflow((prev) => ({
          ...prev,
          [selectedWorkflowPath]: el.scrollTop,
        }))
      }
    } else if (timeline.length > lastSeenCountRef.current) {
      setScrollIndicator("new")
    }
  }, [
    timeline.length,
    selectedWorkflowPath,
    setChatScrollTopByWorkflow,
    status,
  ])

  const isEmpty = timeline.length === 0

  const scrollToBottom = () => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    lastSeenCountRef.current = timeline.length
    setScrollIndicator("hidden")
  }

  return (
    <div className={cn("relative flex-1 min-h-0", isEmpty && "opacity-0 pointer-events-none")}>
      <div
        ref={containerRef}
        className="h-full overflow-y-auto ui-scroll-region"
        data-chat-panel=""
      >
        <div className="max-w-3xl mx-auto w-full px-4 py-4 space-y-2">
          {/* Past run context strip */}
          {pastRunMeta && (
            <div className="ui-context-strip flex items-center gap-2 px-3 py-1.5 rounded-md">
              <Clock size={12} className="text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="ui-meta-text text-muted-foreground">
                Viewing past run
                {pastRunMeta.completedAt
                  ? ` · ${new Date(pastRunMeta.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : ""}
                {pastRunMeta.durationMs
                  ? ` · ${formatPastRunDuration(pastRunMeta.durationMs)}`
                  : ""}
              </span>
            </div>
          )}
          {timeline.map((entry, index) => {
            // Detect run boundary between consecutive flow entries
            const prevEntry = index > 0 ? timeline[index - 1] : null
            const currentRunIndex =
              entry.kind === "flow" ? entry.message.runIndex : null
            const prevRunIndex =
              prevEntry?.kind === "flow" ? prevEntry.message.runIndex : null
            const showRunBoundary =
              currentRunIndex != null &&
              prevRunIndex != null &&
              currentRunIndex !== prevRunIndex &&
              entry.kind === "flow" &&
              entry.message.content.type === "start"

            // Time separator when gap > 5 minutes (suppressed when run boundary shows)
            const showTimeSep =
              !showRunBoundary &&
              prevEntry != null &&
              getEntryTimestamp(entry) - getEntryTimestamp(prevEntry) >
                FIVE_MINUTES_MS
            const separator = showRunBoundary ? (
              <div
                key={`run-boundary-${index}`}
                className="flex items-center gap-3 pt-4 pb-1"
              >
                <div className="flex-1 border-t border-hairline" />
                <span className="ui-meta-text text-muted-foreground/50 shrink-0">
                  Next step
                </span>
                <div className="flex-1 border-t border-hairline" />
              </div>
            ) : showTimeSep ? (
              <div
                key={`time-${index}`}
                className="flex items-center gap-3 pt-3 pb-1"
              >
                <div className="flex-1 border-t border-hairline" />
                <span className="ui-meta-text text-muted-foreground/50 shrink-0">
                  {formatTimeGap(getEntryTimestamp(entry))}
                </span>
                <div className="flex-1 border-t border-hairline" />
              </div>
            ) : null

            // Build the content element based on entry type
            let content: React.ReactNode = null
            let entryKey: string
            let ptClass: string

            if (entry.kind === "flow") {
              const flowMsg = entry.message
              entryKey = flowMsg.id
              ptClass = "pt-4"
              if (flowMsg.content.type === "start") {
                content = (
                  <FlowStartMessage
                    flowName={flowMsg.flowName}
                    data={flowMsg.content.data}
                  />
                )
              } else if (flowMsg.content.type === "progress") {
                content = <FlowProgressMessage data={flowMsg.content.data} />
              } else if (flowMsg.content.type === "complete") {
                content = (
                  <FlowCompleteMessage
                    flowName={flowMsg.flowName}
                    data={flowMsg.content.data}
                    onFollowUp={onFollowUp}
                    followUpDisabled={followUpDisabled}
                    onOpenReport={(path) => window.api.openPath(path)}
                    onRunAgain={() => handleRetry()}
                    onUseInNewFlow={onUseInNewFlow}
                  />
                )
              } else if (flowMsg.content.type === "error") {
                content = (
                  <FlowErrorMessage
                    flowName={flowMsg.flowName}
                    data={flowMsg.content.data}
                    onRetry={handleRetry}
                    onContinue={handleContinue}
                    onCancel={onCancel}
                  />
                )
              } else if (flowMsg.content.type === "decision") {
                content = (
                  <FlowDecisionMessage
                    flowName={flowMsg.flowName}
                    data={flowMsg.content.data}
                    resolved={resolvedIds.has(flowMsg.id)}
                    onResolved={() => resolveDecision(flowMsg.id)}
                    onRetry={handleRetry}
                  />
                )
              } else if (flowMsg.content.type === "routing") {
                content = (
                  <FlowRoutingMessage
                    data={flowMsg.content.data}
                    onRun={
                      entryState?.awaitingInput
                        ? undefined
                        : handleRunFromRouting
                    }
                    alternatives={
                      hasRouteAlternatives ? routeAlternatives : undefined
                    }
                    pendingAlternativeId={pendingRouteAlternativeId}
                    onSelectAlternative={onSelectRouteAlternative}
                    onSelectClarification={onSelectClarification}
                    onRetryRouting={
                      flowMsg.content.data.error
                        ? handleRetryRouting
                        : undefined
                    }
                  />
                )
              } else if (flowMsg.content.type === "step-narrative") {
                content = (
                  <StepNarrativeItem
                    data={flowMsg.content.data}
                    onRetryFromStep={handleRetry ? (nodeId) => handleRetry(nodeId) : undefined}
                  />
                )
                ptClass = "pt-1" // tight spacing for sequential narrative items
              }
              if (!content) return null
            } else {
              const msg = entry.message
              entryKey = msg.id
              const prevChatEntry = timeline[index - 1]
              const nextChatEntry = timeline[index + 1]
              const prevChat =
                prevChatEntry?.kind === "chat"
                  ? prevChatEntry.message
                  : undefined
              const nextChat =
                nextChatEntry?.kind === "chat"
                  ? nextChatEntry.message
                  : undefined
              const isTurnMessage =
                msg.role === "user" || msg.role === "assistant"
              const groupedWithPrevious = Boolean(
                isTurnMessage && prevChat && prevChat.role === msg.role,
              )
              const groupedWithNext = Boolean(
                isTurnMessage && nextChat && nextChat.role === msg.role,
              )
              ptClass = groupedWithPrevious ? "pt-1.5" : "pt-4"
              content = (
                <ChatMessageBubble
                  message={msg}
                  groupedWithPrevious={groupedWithPrevious && !showTimeSep && !showRunBoundary}
                  groupedWithNext={groupedWithNext}
                />
              )
            }

            return (
              <div
                key={entryKey}
                className={cn(
                  "chat-message-enter",
                  showTimeSep || showRunBoundary ? "" : ptClass,
                  index === 0 && "pt-0",
                )}
              >
                {separator}
                {content}
              </div>
            )
          })}
        </div>
      </div>
      <div
        data-visible={scrollIndicator !== "hidden" ? "true" : "false"}
        className="ui-inline-presence absolute bottom-3 left-1/2 z-10 -translate-x-1/2"
      >
        <button
          type="button"
          onClick={scrollToBottom}
          className="ui-pressable ui-surface-lift inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2/70 px-3 py-1 ui-meta-text text-muted-foreground"
        >
          <ArrowDown size={11} />
          {scrollIndicator === "new" ? "New messages" : "Scroll to bottom"}
        </button>
      </div>
    </div>
  )
}
