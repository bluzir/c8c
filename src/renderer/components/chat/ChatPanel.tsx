import { useState, useCallback, useEffect, useMemo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  chatPanelWidthAtom,
  chatFlowInputRequestAtom,
  chatPendingRoutingPromptAtom,
  chatRoutingProgressAtom,
  currentWorkflowAtom,
  inputValueAtom,
  selectedResultModeIdAtom,
  selectedWorkflowPathAtom,
  selectedWorkflowTemplateContextAtom,
  workflowEntryStateAtom,
} from "@/lib/store"
import { runStatusAtom } from "@/features/execution"
import { currentFlowChatMessagesAtom } from "@/features/execution/flow-chat-state"
import {
  selectedWorkflowExecutionAtom,
  workflowHistoryRunsAtom,
} from "@/features/execution/state"
import { getResultModeQuickStartOptions } from "@/lib/result-modes"
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
  const flowMessages = useAtomValue(currentFlowChatMessagesAtom)
  const chatRoutingProgress = useAtomValue(chatRoutingProgressAtom)
  const entryState = useAtomValue(workflowEntryStateAtom)
  const workflow = useAtomValue(currentWorkflowAtom)
  const templateContext = useAtomValue(selectedWorkflowTemplateContextAtom)
  const executionState = useAtomValue(selectedWorkflowExecutionAtom)
  const workflowHistoryRuns = useAtomValue(workflowHistoryRunsAtom)
  const selectedResultModeId = useAtomValue(selectedResultModeIdAtom)
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

  // True when there are no real messages — chat + flow + active routing.
  // Synthetic messages (past run results, entry state routing) are rendered by
  // ChatMessages inside the normal layout; they don't prevent the centered
  // empty state from showing.
  const isChatEmpty =
    messages.length === 0 &&
    flowMessages.length === 0 &&
    !chatRoutingProgress &&
    !entryState &&
    runStatus === "idle"

  // Quick starts from the selected domain — shown in the centered empty state
  // so users can jump directly into a starting point.
  const quickStarts = useMemo(
    () => getResultModeQuickStartOptions(selectedResultModeId),
    [selectedResultModeId],
  )

  // ── Centered empty state (Manus-style) ──────────────────────────
  if (isChatEmpty) {
    return (
      <div
        className={cn(
          "relative flex h-full flex-col bg-background",
          embedded
            ? "flex-1 min-w-0"
            : "border-l border-hairline shrink-0 ui-motion-standard transition-[opacity,transform] will-change-transform",
          !embedded &&
            collapsed &&
            "translate-x-4 opacity-0 pointer-events-none",
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

        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="max-w-2xl w-full space-y-3 text-center">
            <h1 className="text-2xl font-medium text-foreground">
              {workflow?.name || "What can I do for you?"}
            </h1>
            <p className="text-[15px] text-muted-foreground">
              {templateContext?.useWhen ||
                "Describe your goal \u2014 c8c builds a flow to solve it"}
            </p>
          </div>
          {!selectedWorkflowPath && quickStarts.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-2xl w-full">
              {quickStarts.map((qs) => (
                <button
                  key={qs.templateId}
                  type="button"
                  onClick={() => void startRouting(qs.label)}
                  className="px-3 py-1.5 rounded-full border border-hairline text-body-sm text-foreground/80 hover:text-foreground hover:bg-surface-2/30 ui-motion-fast"
                >
                  {qs.label}
                </button>
              ))}
            </div>
          )}
          <div className="max-w-2xl w-full mt-6">
            <ChatInput
              onSend={handleSend}
              onCancel={cancel}
              isStreaming={isStreaming}
              autoFocus={!collapsed}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Normal layout (messages visible) ────────────────────────────
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

      {!embedded && (
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
      )}

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
