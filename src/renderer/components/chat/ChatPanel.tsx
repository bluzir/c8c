import { useState, useCallback, useEffect, useMemo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import type { CreateEntryHelpModeHint } from "@shared/types"
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
import { useChatSession } from "@/hooks/useChatSession"
import { useFlowRouting } from "@/hooks/useFlowRouting"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
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
  routeAlternatives?: import("./FlowRoutingMessage").RouteAlternativeOption[]
  pendingRouteAlternativeId?: string | null
  onSelectRouteAlternative?: (templateId: string) => void
}

export function ChatPanel({
  collapsed = false,
  onClose,
  minWidth = MIN_PANEL_WIDTH,
  maxWidth = MAX_PANEL_WIDTH,
  embedded = false,
  routeAlternatives,
  pendingRouteAlternativeId,
  onSelectRouteAlternative,
}: ChatPanelProps) {
  const [panelWidth, setPanelWidth] = useAtom(chatPanelWidthAtom)
  const [resizing, setResizing] = useState(false)
  const runStatus = useAtomValue(runStatusAtom)
  const selectedWorkflowPath = useAtomValue(selectedWorkflowPathAtom)
  const setInputValue = useSetAtom(inputValueAtom)
  const setChatFlowInputRequest = useSetAtom(chatFlowInputRequestAtom)
  const setWorkflowEntryState = useSetAtom(workflowEntryStateAtom)
  const { startRouting, selectClarification, resetRoutingState, submitting } =
    useFlowRouting()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const flowMessages = useAtomValue(currentFlowChatMessagesAtom)
  const [chatRoutingProgress, setChatRoutingProgress] = useAtom(
    chatRoutingProgressAtom,
  )
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
  const isRouting = Boolean(chatRoutingProgress) || submitting

  const handleCancel = useCallback(() => {
    if (isRouting) {
      resetRoutingState()
      setChatRoutingProgress(null)
    } else {
      cancel()
    }
  }, [isRouting, resetRoutingState, setChatRoutingProgress, cancel])

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

  // True when the flow completed — either in-memory state or disk fallback.
  const effectivelyDone =
    runStatus === "done" ||
    (runStatus === "idle" &&
      selectedWorkflowPath !== null &&
      workflowHistoryRuns.some((r) => r.status === "completed"))

  /**
   * Tri-mode send handler:
   * 1. Idle + has workflow (no past runs) → start a flow run with this message as input
   * 2. No workflow OR done/has past runs → route to pick a new starting point template
   * 3. Flow running/error → send as agent chat message
   */
  const handleSend = useCallback(
    (message: string, helpModeHint?: CreateEntryHelpModeHint | null) => {
      if (runStatus === "idle" && selectedWorkflowPath && !effectivelyDone) {
        // Truly idle workflow — start the flow run.
        setInputValue(message)
        setChatFlowInputRequest(message)
        setWorkflowEntryState((prev) =>
          prev ? { ...prev, awaitingInput: false } : null,
        )
      } else if (!selectedWorkflowPath || effectivelyDone) {
        // No workflow yet, or flow completed — route to a new flow.
        void startRouting(message, {
          helpModeOverride: helpModeHint,
          sourceArtifacts: effectivelyDone
            ? executionState.artifactRecords
            : undefined,
        })
      } else {
        // Flow is running/error — send as agent chat message.
        sendMessage(message)
      }
    },
    [
      runStatus,
      selectedWorkflowPath,
      effectivelyDone,
      executionState.artifactRecords,
      sendMessage,
      setChatFlowInputRequest,
      setInputValue,
      setWorkflowEntryState,
      startRouting,
    ],
  )

  const handleFollowUp = useCallback(
    (followUp: { label: string; templateId?: string }) => {
      if (!followUp.templateId) return
      void startRouting(followUp.label, {
        templateConstraintId: followUp.templateId,
        sourceArtifacts: executionState.artifactRecords,
      })
    },
    [startRouting, executionState.artifactRecords],
  )

  const handleUseInNewFlow = useCallback(() => {
    openWorkflowCreate({
      sourceArtifacts: executionState.artifactRecords,
    })
  }, [openWorkflowCreate, executionState.artifactRecords])

  const handleClarificationSelect = useCallback(
    (selection: { kind: string; value: string; templateId?: string }) => {
      if (selection.kind === "job_route" && selection.templateId) {
        selectClarification({
          kind: "job_route",
          templateId: selection.templateId,
        })
      } else if (selection.kind === "help_mode") {
        selectClarification({
          kind: "help_mode",
          helpMode: selection.value as CreateEntryHelpModeHint,
        })
      }
    },
    [selectClarification],
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
    [panelWidth, setPanelWidth, minWidth, maxPanelWidth],
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
    workflowHistoryRuns.length === 0 &&
    !chatRoutingProgress &&
    !(
      entryState &&
      (!entryState.workflowPath ||
        entryState.workflowPath === selectedWorkflowPath)
    ) &&
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
          "relative flex flex-col bg-background",
          embedded
            ? "flex-1 min-h-0 min-w-0"
            : "h-full border-l border-hairline shrink-0 ui-motion-standard transition-[opacity,transform] will-change-transform",
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
            <h1 className="text-title-lg text-foreground">
              {(selectedWorkflowPath && workflow?.name) ||
                "What can I do for you?"}
            </h1>
            <p className="text-body-lg text-muted-foreground">
              {templateContext?.useWhen ||
                "Describe your goal \u2014 c8c builds a flow to solve it"}
            </p>
          </div>
          {!selectedWorkflowPath && quickStarts.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-2xl w-full">
              {quickStarts.map((qs, i) => (
                <button
                  key={qs.templateId}
                  type="button"
                  onClick={() =>
                    void startRouting(qs.label, { awaitingInput: true })
                  }
                  title={qs.summary}
                  className="px-3 py-1.5 rounded-full border border-hairline text-body-sm text-foreground/80 hover:text-foreground hover:bg-surface-2/30 ui-motion-fast ui-transition-colors ui-fade-slide-in"
                  style={{
                    animationDelay: `${200 + i * 50}ms`,
                    animationFillMode: "backwards",
                  }}
                >
                  {qs.label}
                </button>
              ))}
            </div>
          )}
          <div className="max-w-2xl w-full mt-6">
            <ChatInput
              onSend={handleSend}
              onCancel={handleCancel}
              isStreaming={isStreaming}
              isCancellable={isStreaming || isRouting}
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
        "relative flex flex-col bg-background overflow-hidden",
        embedded
          ? "flex-1 min-h-0 min-w-0"
          : "h-full border-l border-hairline shrink-0 ui-motion-standard transition-[opacity,transform] will-change-transform",
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

      <ChatMessages
        messages={messages}
        status={status}
        onSelectClarification={handleClarificationSelect}
        onFollowUp={handleFollowUp}
        onUseInNewFlow={handleUseInNewFlow}
        routeAlternatives={routeAlternatives}
        pendingRouteAlternativeId={pendingRouteAlternativeId}
        onSelectRouteAlternative={onSelectRouteAlternative}
      />

      <ChatInput
        onSend={handleSend}
        onCancel={handleCancel}
        isStreaming={isStreaming}
        isCancellable={isStreaming || isRouting}
        autoFocus={!collapsed}
        effectivelyDone={effectivelyDone}
      />
    </div>
  )
}
