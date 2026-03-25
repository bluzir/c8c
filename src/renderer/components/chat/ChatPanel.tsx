import { useState, useCallback, useEffect } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  chatPanelWidthAtom,
  chatFlowInputRequestAtom,
  chatPendingRoutingPromptAtom,
  inputValueAtom,
  selectedWorkflowPathAtom,
} from "@/lib/store"
import { runStatusAtom } from "@/features/execution"
import { ChatHeader } from "./ChatHeader"
import { ChatMessages } from "./ChatMessages"
import { ChatInput } from "./ChatInput"
import { FlowProgressBar } from "./FlowProgressBar"
import { useChatSession } from "@/hooks/useChatSession"
import { useFlowRouting } from "@/hooks/useFlowRouting"
import { cn } from "@/lib/cn"

const MIN_PANEL_WIDTH = 280
const MAX_PANEL_WIDTH = 600

interface ChatPanelProps {
  collapsed?: boolean
  onClose: () => void
  minWidth?: number
  maxWidth?: number
  /** When true, fills parent container instead of using fixed width. Hides resize handle and close button. */
  embedded?: boolean
}

export function ChatPanel({
  collapsed = false,
  onClose,
  minWidth = MIN_PANEL_WIDTH,
  maxWidth = MAX_PANEL_WIDTH,
  embedded = false,
}: ChatPanelProps) {
  const [panelWidth, setPanelWidth] = useAtom(chatPanelWidthAtom)
  const [resizing, setResizing] = useState(false)
  const runStatus = useAtomValue(runStatusAtom)
  const selectedWorkflowPath = useAtomValue(selectedWorkflowPathAtom)
  const setInputValue = useSetAtom(inputValueAtom)
  const setChatFlowInputRequest = useSetAtom(chatFlowInputRequestAtom)
  const { startRouting } = useFlowRouting()
  const [pendingRoutingPrompt, setPendingRoutingPrompt] = useAtom(
    chatPendingRoutingPromptAtom,
  )

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

  // Auto-trigger routing when navigated here with a pending prompt
  // (e.g. from useWorkflowCreateNavigation with a prompt option).
  useEffect(() => {
    if (pendingRoutingPrompt && !selectedWorkflowPath) {
      const prompt = pendingRoutingPrompt
      setPendingRoutingPrompt(null)
      void startRouting(prompt)
    }
  }, [
    pendingRoutingPrompt,
    selectedWorkflowPath,
    setPendingRoutingPrompt,
    startRouting,
  ])

  /**
   * Tri-mode send handler:
   * 1. Idle + has workflow → start a flow run with this message as input
   * 2. No workflow (idle) → route to pick a starting point template
   * 3. Flow running/done/error → send as agent chat message
   */
  const handleSend = useCallback(
    (message: string) => {
      if (runStatus === "idle" && selectedWorkflowPath) {
        // Already have a workflow — start the flow run.
        setInputValue(message)
        setChatFlowInputRequest(message)
      } else if (!selectedWorkflowPath) {
        // No workflow yet — route to pick a template.
        void startRouting(message)
      } else {
        // Flow is running/done/error — send as agent chat message.
        sendMessage(message)
      }
    },
    [
      runStatus,
      selectedWorkflowPath,
      sendMessage,
      setChatFlowInputRequest,
      setInputValue,
      startRouting,
    ],
  )
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
        "relative flex h-full flex-col bg-background",
        embedded
          ? "flex-1 min-w-0"
          : "border-l border-hairline shrink-0 ui-motion-standard transition-[opacity,transform] will-change-transform",
        !embedded && collapsed && "translate-x-4 opacity-0 pointer-events-none",
      )}
      style={embedded ? undefined : { width: panelWidth }}
    >
      {/* Left resize handle — side-panel mode only */}
      {!embedded && (
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
      )}

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
        showClose={!embedded}
      />

      <ChatMessages messages={messages} status={status} />

      <FlowProgressBar />
      <ChatInput
        onSend={handleSend}
        onCancel={cancel}
        isStreaming={isStreaming}
        autoFocus={!collapsed}
      />
    </div>
  )
}
