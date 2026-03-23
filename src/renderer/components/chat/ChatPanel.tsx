import { useState, useCallback } from "react"
import { useAtom } from "jotai"
import { chatPanelWidthAtom } from "@/lib/store"
import { ChatHeader } from "./ChatHeader"
import { ChatMessages } from "./ChatMessages"
import { ChatInput } from "./ChatInput"
import { useChatSession } from "@/hooks/useChatSession"
import { cn } from "@/lib/cn"

const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 600

interface ChatPanelProps {
  collapsed?: boolean
  onClose: () => void
  minWidth?: number
  maxWidth?: number
}

export function ChatPanel({
  collapsed = false,
  onClose,
  minWidth = MIN_PANEL_WIDTH,
  maxWidth = MAX_PANEL_WIDTH,
}: ChatPanelProps) {
  const [panelWidth, setPanelWidth] = useAtom(chatPanelWidthAtom)
  const [resizing, setResizing] = useState(false)

  const {
    messages,
    status,
    activeToolName,
    undoStack,
    sendMessage,
    cancel,
    clearHistory,
    undo,
  } = useChatSession()

  const isStreaming = status === "thinking" || status === "streaming"
  const maxPanelWidth = Math.max(
    minWidth,
    Math.min(maxWidth, Math.floor(window.innerWidth * 0.4)),
  )

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()

      const startX = event.clientX
      const startWidth = panelWidth
      setResizing(true)

      const handleMove = (moveEvent: PointerEvent) => {
        // Moving left = larger panel (panel is on the right side)
        const next = Math.max(
          minWidth,
          Math.min(maxPanelWidth, startWidth - (moveEvent.clientX - startX)),
        )
        setPanelWidth(next)
      }

      const stopResize = () => {
        setResizing(false)
        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", stopResize)
        window.removeEventListener("pointercancel", stopResize)
      }

      window.addEventListener("pointermove", handleMove)
      window.addEventListener("pointerup", stopResize)
      window.addEventListener("pointercancel", stopResize)
    },
    [panelWidth, setPanelWidth],
  )

  const handleResizeKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const STEP = 8
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        setPanelWidth((w) => Math.min(maxPanelWidth, w + STEP))
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        setPanelWidth((w) => Math.max(minWidth, w - STEP))
      }
    },
    [maxPanelWidth, minWidth, setPanelWidth],
  )

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-l border-hairline bg-background shrink-0 ui-motion-standard transition-[opacity,transform] will-change-transform",
        collapsed && "translate-x-4 opacity-0 pointer-events-none",
      )}
      style={{ width: panelWidth }}
    >
      {/* Left resize handle */}
      <div
        role="slider"
        aria-orientation="horizontal"
        aria-label="Resize Agent panel"
        aria-valuenow={panelWidth}
        aria-valuemin={minWidth}
        aria-valuemax={maxPanelWidth}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={handleResizeKeyDown}
        className={cn(
          "absolute left-0 top-0 h-full z-10 ui-resize-handle",
          collapsed && "pointer-events-none",
        )}
        data-resizing={resizing}
      />

      <ChatHeader
        onClose={onClose}
        onUndo={undo}
        onClear={clearHistory}
        canUndo={undoStack.length > 0}
        messageCount={
          messages.filter((m) => m.role === "user" || m.role === "assistant")
            .length
        }
        status={status}
        activeToolName={activeToolName}
      />

      <ChatMessages messages={messages} status={status} />

      <ChatInput
        onSend={sendMessage}
        onCancel={cancel}
        isStreaming={isStreaming}
        autoFocus={!collapsed}
      />
    </div>
  )
}
