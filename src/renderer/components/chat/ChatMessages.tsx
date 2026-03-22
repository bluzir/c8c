import { useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import { ChatMessageBubble } from "./ChatMessageBubble"
import { cn } from "@/lib/cn"
import { ArrowDown } from "lucide-react"
import {
  chatScrollTopByWorkflowAtom,
  selectedWorkflowPathAtom,
  type ChatMessageDisplay,
} from "@/lib/store"

interface ChatMessagesProps {
  messages: ChatMessageDisplay[]
  status: "idle" | "thinking" | "streaming" | "error"
}

export function ChatMessages({ messages, status }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [showScrollIndicator, setShowScrollIndicator] = useState(false)
  const [selectedWorkflowPath] = useAtom(selectedWorkflowPathAtom)
  const [chatScrollTopByWorkflow, setChatScrollTopByWorkflow] = useAtom(chatScrollTopByWorkflowAtom)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleScroll = () => {
      const threshold = 80
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      isNearBottomRef.current = nearBottom
      setShowScrollIndicator(!nearBottom)
      if (selectedWorkflowPath) {
        setChatScrollTopByWorkflow((prev) => ({ ...prev, [selectedWorkflowPath]: el.scrollTop }))
      }
    }

    el.addEventListener("scroll", handleScroll)
    return () => el.removeEventListener("scroll", handleScroll)
  }, [selectedWorkflowPath, setChatScrollTopByWorkflow])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const savedScrollTop = selectedWorkflowPath ? chatScrollTopByWorkflow[selectedWorkflowPath] : null
    if (typeof savedScrollTop === "number" && savedScrollTop > 0) {
      el.scrollTop = savedScrollTop
      isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
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
        setChatScrollTopByWorkflow((prev) => ({ ...prev, [selectedWorkflowPath]: el.scrollTop }))
      }
    } else if (messages.length > 0) {
      setShowScrollIndicator(true)
    }
  }, [messages, selectedWorkflowPath, setChatScrollTopByWorkflow, status])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <div className="ui-empty-state rounded-lg surface-soft px-8 text-muted-foreground">
          <p className="ui-body-text-medium mb-1">Agent</p>
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
    <div ref={containerRef} className="h-full overflow-y-auto ui-scroll-region px-3 py-3 space-y-0">
      {messages.map((msg, index) => {
        const prev = messages[index - 1]
        const next = messages[index + 1]
        const isTurnMessage = msg.role === "user" || msg.role === "assistant"
        const groupedWithPrevious = Boolean(
          isTurnMessage
          && prev
          && prev.role === msg.role,
        )
        const groupedWithNext = Boolean(
          isTurnMessage
          && next
          && next.role === msg.role,
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
        className="ui-pressable ui-surface-lift inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2/70 px-3 py-1 ui-meta-text text-muted-foreground shadow-inset-highlight-subtle"
      >
        <ArrowDown size={11} />
        New messages
      </button>
    </div>
    </div>
  )
}
