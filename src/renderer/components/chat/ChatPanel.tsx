import { useState, useCallback, useEffect, useMemo } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import type { Chat, CreateEntryHelpModeHint } from "@shared/types"
import {
  chatPanelWidthAtom,
  chatFlowInputRequestAtom,
  chatPendingRoutingPromptAtom,
  chatRoutingProgressAtom,
  currentWorkflowAtom,
  inputValueAtom,
  mainViewAtom,
  selectedChatIdAtom,
  selectedProjectAtom,
  selectedResultModeIdAtom,
  selectedWorkflowPathAtom,
  selectedWorkflowTemplateContextAtom,
  updateChatInRegistryAtom,
  workflowCreateSourceArtifactsAtom,
  workflowEntryStateAtom,
} from "@/lib/store"
import { runStatusAtom } from "@/features/execution"
import { currentFlowChatMessagesAtom } from "@/features/execution/flow-chat-state"
import {
  effectiveExecutionStateAtom,
  workflowHistoryRunsAtom,
} from "@/features/execution/state"
import { getResultModeQuickStartOptions } from "@/lib/result-modes"
import { ChatHeader } from "./ChatHeader"
import { ChatMessages } from "./ChatMessages"
import { ChatInput } from "./ChatInput"
import { SourceArtifactChips } from "./SourceArtifactChips"
import { useChatSession } from "@/hooks/useChatSession"
import { useFlowRouting } from "@/hooks/useFlowRouting"
import { useRoutingTransaction } from "@/hooks/useRoutingTransaction"
import { useWorkflowCreateNavigation } from "@/hooks/useWorkflowCreateNavigation"
import type { RoutingIntent } from "@shared/routing-types"
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
  /** Attachments derived from the completed run's results — threaded to follow-up and post-completion sends. */
  resultSourceAttachments?: import("@shared/types").InputAttachment[]
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
  resultSourceAttachments,
}: ChatPanelProps) {
  const [panelWidth, setPanelWidth] = useAtom(chatPanelWidthAtom)
  const [resizing, setResizing] = useState(false)
  const runStatus = useAtomValue(runStatusAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)
  const selectedWorkflowPath = useAtomValue(selectedWorkflowPathAtom)
  const setInputValue = useSetAtom(inputValueAtom)
  const setChatFlowInputRequest = useSetAtom(chatFlowInputRequestAtom)
  const setWorkflowEntryState = useSetAtom(workflowEntryStateAtom)
  const setMainView = useSetAtom(mainViewAtom)
  const { startRouting, selectClarification, resetRoutingState, submitting } =
    useFlowRouting()
  const { dispatch: dispatchRouting, cancel: cancelRouting, dispatching: routingDispatching } =
    useRoutingTransaction()
  const { openWorkflowCreate } = useWorkflowCreateNavigation()
  const flowMessages = useAtomValue(currentFlowChatMessagesAtom)
  const [chatRoutingProgress, setChatRoutingProgress] = useAtom(
    chatRoutingProgressAtom,
  )
  const entryState = useAtomValue(workflowEntryStateAtom)
  const workflow = useAtomValue(currentWorkflowAtom)
  const templateContext = useAtomValue(selectedWorkflowTemplateContextAtom)
  const executionState = useAtomValue(effectiveExecutionStateAtom)
  const workflowHistoryRuns = useAtomValue(workflowHistoryRunsAtom)
  const [createSourceArtifacts, setCreateSourceArtifacts] = useAtom(
    workflowCreateSourceArtifactsAtom,
  )
  const selectedResultModeId = useAtomValue(selectedResultModeIdAtom)
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom)
  const updateChatInRegistry = useSetAtom(updateChatInRegistryAtom)
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
  const isRouting = Boolean(chatRoutingProgress) || submitting || routingDispatching
  const followUpDisabled =
    runStatus === "running" || runStatus === "starting" || isRouting

  const handleCancel = useCallback(() => {
    if (routingDispatching) {
      cancelRouting()
    } else if (isRouting) {
      resetRoutingState()
      setChatRoutingProgress(null)
    } else {
      cancel()
    }
  }, [routingDispatching, cancelRouting, isRouting, resetRoutingState, setChatRoutingProgress, cancel])

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

  // True when the flow completed or terminated — either in-memory state,
  // disk fallback, or persisted entry state indicating a past run was started
  // (covers the window between app restart and async pastRunsAtom load).
  // "error" and "cancelling" are included so that a post-cancel or post-error
  // send routes to a new flow instead of falling through to agent chat.
  const effectivelyDone =
    runStatus === "done" ||
    runStatus === "error" ||
    runStatus === "cancelling" ||
    (runStatus === "idle" &&
      selectedWorkflowPath !== null &&
      (workflowHistoryRuns.some((r) => r.status === "completed") ||
        (flowMessages.length === 0 &&
          entryState?.workflowPath === selectedWorkflowPath &&
          entryState?.awaitingInput === false)))

  /**
   * Tri-mode send handler:
   * 1. Idle + has workflow (no past runs) → start a flow run with this message as input
   * 2. No workflow OR done/error/cancelling → route to pick a new starting point template
   * 3. Flow running/starting/paused → send as agent chat message
   */
  const handleSend = useCallback(
    async (message: string, helpModeHint?: CreateEntryHelpModeHint | null) => {
      if (runStatus === "idle" && selectedWorkflowPath && !effectivelyDone) {
        // Truly idle workflow — start the flow run.
        setInputValue(message)
        setChatFlowInputRequest({ kind: "run" })
        setWorkflowEntryState((prev) =>
          prev ? { ...prev, awaitingInput: false } : null,
        )
      } else if (!selectedWorkflowPath || effectivelyDone) {
        // No workflow yet, or flow completed — route to a new flow.
        // Ensure a Chat entity exists so the run is tracked.
        let chatId = selectedChatId
        if (!chatId && selectedProject) {
          chatId = crypto.randomUUID()
          const newChat: Chat = {
            id: chatId,
            name: message.slice(0, 60),
            projectPath: selectedProject,
            createdAt: Date.now(),
            lastActivityAt: Date.now(),
            archived: false,
            runs: [],
            artifactPool: [],
          }
          void window.api.createChat(selectedProject, newChat)
          setSelectedChatId(chatId)
          updateChatInRegistry(newChat)
        }

        // After app restart, in-memory artifactRecords may be empty even though
        // persisted project artifacts exist.  Load from disk as a fallback.
        let artifacts = effectivelyDone
          ? executionState.artifactRecords
          : undefined
        if (artifacts && artifacts.length === 0 && selectedProject) {
          try {
            artifacts = await window.api.listProjectArtifacts(selectedProject)
          } catch {
            artifacts = []
          }
        }
        void startRouting(message, {
          chatId: chatId ?? undefined,
          helpModeOverride: helpModeHint,
          sourceArtifacts: artifacts,
          sourceAttachments: effectivelyDone
            ? resultSourceAttachments
            : undefined,
        })
      } else {
        // Flow is running/starting/paused — send as agent chat message.
        sendMessage(message)
      }
    },
    [
      runStatus,
      selectedWorkflowPath,
      selectedProject,
      selectedChatId,
      effectivelyDone,
      executionState.artifactRecords,
      resultSourceAttachments,
      sendMessage,
      setChatFlowInputRequest,
      setInputValue,
      setSelectedChatId,
      setWorkflowEntryState,
      startRouting,
      updateChatInRegistry,
    ],
  )

  const handleFollowUp = useCallback(
    (followUp: { label: string; templateId?: string }) => {
      if (!followUp.templateId || isRouting) return

      // Build a self-contained RoutingIntent — the runner resolves artifacts
      // from disk via sourceArtifactIds, so no ambient state reads needed.
      const outputArtifactIds = executionState.artifactRecords.map((a) => a.id)

      const intent: RoutingIntent = {
        type: "follow_up",
        projectPath: selectedProject ?? "",
        requestedResult: followUp.label,
        templateConstraintId: followUp.templateId,
        sourceRunId: executionState.runId ?? undefined,
        sourceArtifactIds:
          outputArtifactIds.length > 0
            ? outputArtifactIds
            : templateContext?.sourceArtifactIds,
        sourceWorkflowKey: selectedWorkflowPath ?? undefined,
        chatId: selectedChatId ?? undefined,
      }
      dispatchRouting(intent)
    },
    [
      dispatchRouting,
      isRouting,
      selectedChatId,
      selectedProject,
      executionState.artifactRecords,
      executionState.runId,
      templateContext?.sourceArtifactIds,
      selectedWorkflowPath,
    ],
  )

  const handleUseInNewFlow = useCallback(() => {
    openWorkflowCreate({
      sourceArtifacts: executionState.artifactRecords,
    })
  }, [openWorkflowCreate, executionState.artifactRecords])

  const handleRemoveSourceArtifact = useCallback(
    (id: string) => {
      setCreateSourceArtifacts((prev) => prev.filter((a) => a.id !== id))
    },
    [setCreateSourceArtifacts],
  )

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
          {!selectedWorkflowPath && (
            <button
              type="button"
              onClick={() => setMainView("templates")}
              className="mt-3 text-body-sm text-muted-foreground hover:text-foreground ui-motion-fast ui-transition-colors"
            >
              Browse starting points
            </button>
          )}
          <div className="max-w-2xl w-full mt-6 space-y-2">
            <SourceArtifactChips
              artifacts={createSourceArtifacts}
              onRemove={handleRemoveSourceArtifact}
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
        followUpDisabled={followUpDisabled}
        routeAlternatives={routeAlternatives}
        pendingRouteAlternativeId={pendingRouteAlternativeId}
        onSelectRouteAlternative={onSelectRouteAlternative}
        onCancel={handleCancel}
      />

      <div className="max-w-3xl mx-auto w-full px-4">
        <SourceArtifactChips
          artifacts={createSourceArtifacts}
          onRemove={handleRemoveSourceArtifact}
        />
      </div>
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
