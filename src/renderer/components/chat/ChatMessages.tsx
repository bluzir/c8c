import { useEffect, useRef, useState, useMemo } from "react"
import { useAtom } from "jotai"
import { useAtomValue, useSetAtom } from "jotai"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { FlowDecisionMessage } from "./FlowDecisionMessage"
import { cn } from "@/lib/cn"
import { ArrowDown } from "lucide-react"
import {
  chatScrollTopByWorkflowAtom,
  selectedWorkflowPathAtom,
  type ChatMessageDisplay,
} from "@/lib/store"
import {
  currentFlowChatMessagesAtom,
  resolvedDecisionIdsAtom,
  resolveFlowChatDecisionAtom,
} from "@/features/execution/flow-chat-state"
import type { FlowChatMessage } from "@/lib/flow-chat-types"

type TimelineEntry =
  | { kind: "chat"; message: ChatMessageDisplay }
  | { kind: "flow"; message: FlowChatMessage }

interface ChatMessagesProps {
  messages: ChatMessageDisplay[]
  status: "idle" | "thinking" | "streaming" | "error"
}

export function ChatMessages({ messages, status }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [showScrollIndicator, setShowScrollIndicator] = useState(false)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [chatScrollTopByWorkflow, setChatScrollTopByWorkflow] = useAtom(
    chatScrollTopByWorkflowAtom,
  )
  const flowMessages = useAtomValue(currentFlowChatMessagesAtom)
  const resolvedIds = useAtomValue(resolvedDecisionIdsAtom)
  const resolveDecision = useSetAtom(resolveFlowChatDecisionAtom)

  const timeline = useMemo<TimelineEntry[]>(() => {
    const chatEntries: TimelineEntry[] = messages.map((m) => ({
      kind: "chat",
      message: m,
    }))
    const flowEntries: TimelineEntry[] = flowMessages.map((m) => ({
      kind: "flow",
      message: m,
    }))
    return [...chatEntries, ...flowEntries].sort((a, b) => {
      const tsA = a.kind === "chat" ? a.message.timestamp : a.message.timestamp
      const tsB = b.kind === "chat" ? b.message.timestamp : b.message.timestamp
      return tsA - tsB
    })
  }, [messages, flowMessages])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleScroll = () => {
      const threshold = 80
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      isNearBottomRef.current = nearBottom
      setShowScrollIndicator(!nearBottom)
      if (selectedWorkflowPath) {
        setChatScrollTopByWorkflow((prev) => ({
          ...prev,
          [selectedWorkflowPath]: el.scrollTop,
        }))
      }
    }

    el.addEventListener("scroll", handleScroll)
    return () => el.removeEventListener("scroll", handleScroll)
  }, [selectedWorkflowPath, setChatScrollTopByWorkflow])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
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
      if (selectedWorkflowPath) {
        setChatScrollTopByWorkflow((prev) => ({
          ...prev,
          [selectedWorkflowPath]: el.scrollTop,
        }))
      }
    } else if (messages.length > 0 || flowMessages.length > 0) {
      setShowScrollIndicator(true)
    }
  }, [
    messages,
    flowMessages,
    selectedWorkflowPath,
    setChatScrollTopByWorkflow,
    status,
  ])

  if (timeline.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <div className="ui-empty-state rounded-lg px-8 text-muted-foreground">
          <p className="text-body-md font-medium mb-1">Agent</p>
          <p className="ui-meta-text leading-relaxed">
            Ask me to add skills, build pipelines,
            <br />
            or search through your skill library.
          </p>
        </div>
      </div>
    )
  }

  const scrollToBottom = () => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    setShowScrollIndicator(false)
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto ui-scroll-region px-3 py-3 space-y-0"
      >
        {timeline.map((entry, index) => {
          if (entry.kind === "flow") {
            const flowMsg = entry.message
            return (
              <div
                key={flowMsg.id}
                className={cn("ui-fade-slide-in pt-3", index === 0 && "pt-0")}
              >
                <FlowDecisionMessage
                  flowName={flowMsg.flowName}
                  data={
                    flowMsg.content.type === "decision"
                      ? flowMsg.content.data
                      : (undefined as never)
                  }
                  resolved={resolvedIds.has(flowMsg.id)}
                  onResolved={() => resolveDecision(flowMsg.id)}
                />
              </div>
            )
          }

          const msg = entry.message
          const prevEntry = timeline[index - 1]
          const nextEntry = timeline[index + 1]
          const prev =
            prevEntry?.kind === "chat" ? prevEntry.message : undefined
          const next =
            nextEntry?.kind === "chat" ? nextEntry.message : undefined
          const isTurnMessage = msg.role === "user" || msg.role === "assistant"
          const groupedWithPrevious = Boolean(
            isTurnMessage && prev && prev.role === msg.role,
          )
          const groupedWithNext = Boolean(
            isTurnMessage && next && next.role === msg.role,
          )

          return (
            <div
              key={msg.id}
              className={cn(
                "ui-fade-slide-in",
                groupedWithPrevious ? "pt-1" : "pt-3",
                index === 0 && "pt-0",
              )}
            >
              <ChatMessageBubble
                message={msg}
                groupedWithPrevious={groupedWithPrevious}
                groupedWithNext={groupedWithNext}
              />
            </div>
          )
        })}
      </div>
      <div
        data-visible={showScrollIndicator ? "true" : "false"}
        className="ui-inline-presence absolute bottom-3 left-1/2 z-10 -translate-x-1/2"
      >
        <button
          type="button"
          onClick={scrollToBottom}
          className="ui-pressable ui-surface-lift inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2/70 px-3 py-1 ui-meta-text text-muted-foreground"
        >
          <ArrowDown size={11} />
          New messages
        </button>
      </div>
    </div>
  )
}
