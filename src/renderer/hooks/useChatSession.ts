import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type MutableRefObject,
} from "react"
import { useStableSubscription } from "./useStableSubscription"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  chatMessagesAtom,
  chatStatusAtom,
  chatSessionIdAtom,
  chatUndoStackAtom,
  currentWorkflowAtom,
  selectedWorkflowPathAtom,
  selectedProjectAtom,
  workflowCreatePendingEntryAtom,
  workflowCreatePendingMessageAtom,
  workflowEntryStateAtom,
  workflowDirtyAtom,
  workflowSavedSnapshotAtom,
  type ChatMessageDisplay,
} from "@/lib/store"
import { workflowSnapshot } from "@/lib/workflow-snapshot"
import { selectedChatIdAtom } from "@/lib/chat-atoms"
import type {
  ChatConversation,
  ChatSessionMessage,
  ChatSessionSnapshot,
  Workflow,
} from "@shared/types"
import { sanitizeAssistantText } from "@shared/chat-output"
import { toast } from "sonner"
import { toastError } from "@/lib/toast-error"
import { errorToUserMessage } from "@/lib/error-message"
import { useInboxNotifications } from "@/hooks/useInboxNotifications"
import { buildGeneratedWorkflowEntryState } from "@/lib/workflow-entry"

type ChatRecoveryApi = typeof window.api & {
  chatGetActiveSession?: (
    workflowPath: string,
  ) => Promise<ChatSessionSnapshot | null>
}

let warnedMissingChatGetActiveSession = false

function isWorkflowPayload(value: unknown): value is Workflow {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<Workflow>
  if (
    typeof candidate.version !== "number" ||
    typeof candidate.name !== "string"
  )
    return false
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges))
    return false
  return (
    candidate.nodes.every(
      (node) =>
        !!node &&
        typeof node.id === "string" &&
        typeof node.type === "string" &&
        !!node.config &&
        typeof node.config === "object",
    ) &&
    candidate.edges.every(
      (edge) =>
        !!edge &&
        typeof edge.id === "string" &&
        typeof edge.source === "string" &&
        typeof edge.target === "string" &&
        typeof edge.type === "string",
    )
  )
}

function hasGeneratedWorkflowSteps(workflow: Workflow): boolean {
  return workflow.nodes.some(
    (node) => node.type !== "input" && node.type !== "output",
  )
}

function toDisplayMessage(
  message: ChatSessionMessage,
): ChatMessageDisplay | null {
  const content =
    message.role === "assistant"
      ? sanitizeAssistantText(message.content, { streaming: message.streaming })
      : message.content

  if (message.role === "assistant" && !message.streaming && !content.trim()) {
    return null
  }

  return {
    id: message.id,
    role: message.role,
    content,
    timestamp: message.timestamp,
    toolName: message.toolName,
    toolInput: message.toolInput,
    toolCallId: message.toolCallId,
    toolOutput: message.toolOutput,
    toolError: message.toolError,
    streaming: message.streaming,
  }
}

function toDisplayMessages(
  messages: ChatSessionMessage[],
): ChatMessageDisplay[] {
  return messages.flatMap((message) => {
    const displayMessage = toDisplayMessage(message)
    return displayMessage ? [displayMessage] : []
  })
}

export function resolveRecoveredWorkflow({
  activeSessionWorkflow,
  conversationLatestWorkflow,
  fileWorkflow,
  workflowDirty,
}: {
  activeSessionWorkflow: Workflow | null
  conversationLatestWorkflow: Workflow | null
  fileWorkflow: Workflow | null
  workflowDirty: boolean
}): Workflow | null {
  if (activeSessionWorkflow && isWorkflowPayload(activeSessionWorkflow)) {
    return activeSessionWorkflow
  }
  if (workflowDirty) {
    return null
  }
  if (fileWorkflow) {
    return fileWorkflow
  }
  if (
    conversationLatestWorkflow &&
    isWorkflowPayload(conversationLatestWorkflow)
  ) {
    return conversationLatestWorkflow
  }
  return null
}

function restoreActiveSessionState(
  snapshot: ChatSessionSnapshot,
  setMessages: (
    next:
      | ChatMessageDisplay[]
      | ((prev: ChatMessageDisplay[]) => ChatMessageDisplay[]),
  ) => void,
  setStatus: (next: "idle" | "thinking" | "streaming" | "error") => void,
  setSessionId: (next: string | null) => void,
  setActiveToolName: (next: string | null) => void,
  statusRef: MutableRefObject<"idle" | "thinking" | "streaming" | "error">,
  sessionIdRef: MutableRefObject<string | null>,
  pendingSessionRef: MutableRefObject<string | null>,
  streamingTextRef: MutableRefObject<string>,
): void {
  const displayMessages = toDisplayMessages(snapshot.messages)
  const activeStreaming = snapshot.messages.find(
    (message) => message.role === "assistant" && message.streaming,
  )

  setMessages(displayMessages)
  streamingTextRef.current = activeStreaming?.content || ""
  pendingSessionRef.current = snapshot.sessionId
  sessionIdRef.current = snapshot.sessionId
  statusRef.current = snapshot.status
  setSessionId(snapshot.sessionId)
  setStatus(snapshot.status)
  setActiveToolName(snapshot.activeToolName)
}

async function loadChatRecoveryState(workflowPath: string): Promise<{
  conversation: ChatConversation | null
  activeSession: ChatSessionSnapshot | null
}> {
  const api = window.api as ChatRecoveryApi
  const getActiveSession = api.chatGetActiveSession

  if (typeof getActiveSession !== "function") {
    if (!warnedMissingChatGetActiveSession) {
      warnedMissingChatGetActiveSession = true
      console.warn(
        "[useChatSession] preload API missing chatGetActiveSession; falling back to history-only recovery",
      )
    }

    const conversation = await window.api.chatLoadHistory(workflowPath)
    return { conversation, activeSession: null }
  }

  const [conversation, activeSession] = await Promise.all([
    window.api.chatLoadHistory(workflowPath),
    getActiveSession(workflowPath),
  ])

  return { conversation, activeSession }
}

export function useChatSession() {
  const [messages, setMessages] = useAtom(chatMessagesAtom)
  const [status, setStatus] = useAtom(chatStatusAtom)
  const [sessionId, setSessionId] = useAtom(chatSessionIdAtom)
  const [undoStack, setUndoStack] = useAtom(chatUndoStackAtom)
  const setWorkflow = useSetAtom(currentWorkflowAtom)
  const setWorkflowSavedSnapshot = useSetAtom(workflowSavedSnapshotAtom)
  const [workflowPath] = useAtom(selectedWorkflowPathAtom)
  const [selectedProject] = useAtom(selectedProjectAtom)
  const selectedChatId = useAtomValue(selectedChatIdAtom)
  const [pendingCreateEntry, setPendingCreateEntry] = useAtom(
    workflowCreatePendingEntryAtom,
  )
  const [pendingCreateMessage, setPendingCreateMessage] = useAtom(
    workflowCreatePendingMessageAtom,
  )
  const [workflow] = useAtom(currentWorkflowAtom)
  const workflowDirty = useAtomValue(workflowDirtyAtom)
  const setWorkflowEntryState = useSetAtom(workflowEntryStateAtom)
  const [activeToolName, setActiveToolName] = useState<string | null>(null)
  const [historyLoadedWorkflowPath, setHistoryLoadedWorkflowPath] = useState<
    string | null
  >(null)
  const { addNotification } = useInboxNotifications()

  const streamingTextRef = useRef("")
  const workflowRef = useRef(workflow)
  const workflowDirtyRef = useRef(workflowDirty)
  const workflowPathRef = useRef(workflowPath)
  const historyRequestRef = useRef(0)
  const statusRef = useRef(status)
  const sessionIdRef = useRef(sessionId)
  const pendingSessionRef = useRef<string | null>(null)
  const localMessageCounterRef = useRef(0)
  workflowRef.current = workflow
  workflowDirtyRef.current = workflowDirty
  workflowPathRef.current = workflowPath
  statusRef.current = status
  sessionIdRef.current = sessionId

  const nextLocalMessageId = useCallback((prefix: string) => {
    localMessageCounterRef.current += 1
    return `${prefix}-${localMessageCounterRef.current}`
  }, [])

  const resetLocalSessionState = useCallback(() => {
    pendingSessionRef.current = null
    sessionIdRef.current = null
    streamingTextRef.current = ""
    statusRef.current = "idle"
    setStatus("idle")
    setSessionId(null)
    setActiveToolName(null)
  }, [setSessionId, setStatus])

  const applyPersistedWorkflow = useCallback(
    (nextWorkflow: Workflow) => {
      workflowRef.current = nextWorkflow
      setWorkflow(nextWorkflow)
      setWorkflowSavedSnapshot(workflowSnapshot(nextWorkflow))
    },
    [setWorkflow, setWorkflowSavedSnapshot],
  )

  const restoreWorkflowFromUndo = useCallback(
    (nextWorkflow: Workflow) => {
      workflowRef.current = nextWorkflow
      setWorkflow(nextWorkflow)
    },
    [setWorkflow],
  )

  const removeStreamingPlaceholder = useCallback(() => {
    setMessages((prev) =>
      prev.filter((m) => !(m.role === "assistant" && m.streaming)),
    )
  }, [setMessages])

  // Subscribe to chat events — stable subscription avoids re-subscribe gaps
  // during active streaming. Handler ref always has fresh closure values.
  useStableSubscription(window.api.onChatEvent, (event) => {
    const currentWorkflowPath = workflowPathRef.current
    if (!currentWorkflowPath || event.workflowPath !== currentWorkflowPath)
      return

    const currentSessionId = sessionIdRef.current

    if (currentSessionId) {
      if (event.sessionId !== currentSessionId) return
    } else {
      const canAcceptSession =
        statusRef.current === "thinking" || statusRef.current === "streaming"
      if (!canAcceptSession) return

      const pendingSessionId = pendingSessionRef.current
      if (pendingSessionId && pendingSessionId !== event.sessionId) return

      if (!pendingSessionId) {
        pendingSessionRef.current = event.sessionId
        sessionIdRef.current = event.sessionId
        setSessionId(event.sessionId)
      }
    }

    switch (event.type) {
      case "text-delta": {
        streamingTextRef.current += event.content
        setActiveToolName(null)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          const displayContent = sanitizeAssistantText(
            streamingTextRef.current,
            { streaming: true },
          )
          if (last && last.role === "assistant" && last.streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: displayContent },
            ]
          }
          return prev
        })
        statusRef.current = "streaming"
        setStatus("streaming")
        break
      }

      case "thinking": {
        statusRef.current = "thinking"
        setStatus("thinking")
        break
      }

      case "tool-call": {
        setActiveToolName(event.toolName)
        const toolMsg: ChatMessageDisplay = {
          id: nextLocalMessageId(`tc-${event.toolCallId}`),
          role: "tool_call",
          content: "",
          timestamp: Date.now(),
          toolName: event.toolName,
          toolInput: event.toolInput,
          toolCallId: event.toolCallId,
        }
        setMessages((prev) => [...prev, toolMsg])
        break
      }

      case "tool-result": {
        setActiveToolName(null)
        const resultMsg: ChatMessageDisplay = {
          id: nextLocalMessageId(`tr-${event.toolCallId}`),
          role: "tool_result",
          content: event.toolOutput || event.toolError || "",
          timestamp: Date.now(),
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          toolOutput: event.toolOutput,
          toolError: event.toolError,
        }
        setMessages((prev) => [...prev, resultMsg])
        break
      }

      case "workflow-mutated": {
        if (!isWorkflowPayload(event.workflow)) {
          toastError("Received an invalid flow update from the Agent.")
          addNotification({
            title: "Agent sent an invalid flow update",
            level: "error",
            source: "agent",
          })
          break
        }

        const nextWorkflow = event.workflow
        if (!workflowRef.current) {
          applyPersistedWorkflow(nextWorkflow)
          break
        }

        // Push current workflow to undo stack before applying mutation.
        const snapshot = structuredClone(workflowRef.current)
        setUndoStack((prev) => [...prev.slice(-19), snapshot])

        applyPersistedWorkflow(nextWorkflow)

        const mutationWorkflowPath = workflowPathRef.current
        const pendingRequest = mutationWorkflowPath
          ? pendingCreateEntry[mutationWorkflowPath]
          : null
        if (pendingRequest && mutationWorkflowPath) {
          setWorkflowEntryState(
            buildGeneratedWorkflowEntryState({
              workflow: nextWorkflow,
              workflowPath: mutationWorkflowPath,
              request: pendingRequest,
              source: "agent_create",
            }),
          )
          setPendingCreateEntry((prev) => {
            const next = { ...prev }
            delete next[mutationWorkflowPath]
            return next
          })
        }
        toast.success("Flow updated from Agent", {
          action: {
            label: "Undo",
            onClick: () => {
              if (workflowPathRef.current !== mutationWorkflowPath) {
                toastError("Undo is only available for the current flow")
                return
              }
              setUndoStack((prev) => {
                if (prev.length === 0) return prev
                const last = prev[prev.length - 1]
                if (last !== snapshot) return prev
                restoreWorkflowFromUndo(last)
                return prev.slice(0, -1)
              })
            },
          },
          duration: 5000,
        })
        break
      }

      case "message-complete": {
        streamingTextRef.current = ""
        const content = sanitizeAssistantText(event.message.content)
        setMessages((prev) => {
          const filtered = prev.filter(
            (m) => !(m.role === "assistant" && m.streaming),
          )
          if (!content.trim()) {
            return filtered
          }
          return [
            ...filtered,
            {
              id: event.message.id,
              role: "assistant",
              content,
              timestamp: event.message.timestamp,
            },
          ]
        })
        break
      }

      case "turn-complete": {
        if (isWorkflowPayload(event.workflow)) {
          applyPersistedWorkflow(event.workflow)
        }
        const currentWorkflow = workflowPathRef.current
        const pendingRequest = currentWorkflow
          ? pendingCreateEntry[currentWorkflow]
          : null
        if (
          currentWorkflow &&
          pendingRequest &&
          hasGeneratedWorkflowSteps(workflowRef.current)
        ) {
          setWorkflowEntryState(
            buildGeneratedWorkflowEntryState({
              workflow: workflowRef.current,
              workflowPath: currentWorkflow,
              request: pendingRequest,
              source: "agent_create",
            }),
          )
        }
        if (currentWorkflow && pendingRequest) {
          setPendingCreateEntry((prev) => {
            const next = { ...prev }
            delete next[currentWorkflow]
            return next
          })
        }
        removeStreamingPlaceholder()
        resetLocalSessionState()
        break
      }

      case "error": {
        const currentWorkflow = workflowPathRef.current
        if (currentWorkflow && pendingCreateEntry[currentWorkflow]) {
          setPendingCreateEntry((prev) => {
            const next = { ...prev }
            delete next[currentWorkflow]
            return next
          })
        }
        removeStreamingPlaceholder()
        resetLocalSessionState()
        toastError(event.content || "Agent error")
        addNotification({
          title: "Agent error",
          description: event.content || "Agent error",
          level: "error",
          source: "agent",
        })
        // Persist error in chat history as a system message
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant" as const,
            content: `**Agent error:** ${event.content || "Agent error"}`,
            timestamp: Date.now(),
          },
        ])
        break
      }
    }
  })

  // Load history when workflow changes
  useEffect(() => {
    historyRequestRef.current += 1
    const requestId = historyRequestRef.current

    resetLocalSessionState()
    setMessages([])
    setUndoStack([])
    setHistoryLoadedWorkflowPath(null)

    if (!workflowPath) {
      return
    }

    Promise.all([
      loadChatRecoveryState(workflowPath),
      workflowDirtyRef.current
        ? Promise.resolve<Workflow | null>(null)
        : window.api.loadWorkflow(workflowPath).catch((error) => {
            console.warn("[useChatSession] workflow file sync skipped:", error)
            return null
          }),
    ])
      .then(([{ conversation, activeSession }, fileWorkflow]) => {
        if (historyRequestRef.current !== requestId) return

        const recoveredWorkflow = resolveRecoveredWorkflow({
          activeSessionWorkflow:
            activeSession?.workflow && isWorkflowPayload(activeSession.workflow)
              ? activeSession.workflow
              : null,
          conversationLatestWorkflow:
            conversation?.latestWorkflow &&
            isWorkflowPayload(conversation.latestWorkflow)
              ? conversation.latestWorkflow
              : null,
          fileWorkflow,
          workflowDirty: workflowDirtyRef.current,
        })
        if (recoveredWorkflow) {
          applyPersistedWorkflow(recoveredWorkflow)
        }

        if (activeSession) {
          restoreActiveSessionState(
            activeSession,
            setMessages,
            setStatus,
            setSessionId,
            setActiveToolName,
            statusRef,
            sessionIdRef,
            pendingSessionRef,
            streamingTextRef,
          )
        } else if (conversation && conversation.messages.length > 0) {
          setMessages(toDisplayMessages(conversation.messages))
        } else {
          setMessages([])
        }

        const pendingRequest = pendingCreateEntry[workflowPath]
        if (
          !activeSession &&
          pendingRequest &&
          workflowPathRef.current === workflowPath &&
          hasGeneratedWorkflowSteps(workflowRef.current)
        ) {
          setWorkflowEntryState(
            buildGeneratedWorkflowEntryState({
              workflow: workflowRef.current,
              workflowPath,
              request: pendingRequest,
              source: "agent_create",
            }),
          )
          setPendingCreateEntry((prev) => {
            const next = { ...prev }
            delete next[workflowPath]
            return next
          })
        }

        setHistoryLoadedWorkflowPath(workflowPath)
      })
      .catch((err) => {
        if (historyRequestRef.current !== requestId) return
        console.error("[useChatSession] chat session recovery failed:", err)
        setMessages([])
        setHistoryLoadedWorkflowPath(workflowPath)
        toastError("Could not load Agent history")
        addNotification({
          title: "Could not load Agent history",
          description: errorToUserMessage(err),
          level: "error",
          source: "agent",
        })
      })
  }, [
    addNotification,
    applyPersistedWorkflow,
    pendingCreateEntry,
    resetLocalSessionState,
    selectedChatId,
    setMessages,
    setPendingCreateEntry,
    setSessionId,
    setStatus,
    setUndoStack,
    setWorkflowEntryState,
    workflowPath,
  ])

  const sendMessage = useCallback(
    async (message: string) => {
      if (!workflowPath || !selectedProject || statusRef.current !== "idle")
        return

      // Add user message immediately.
      const userMsg: ChatMessageDisplay = {
        id: nextLocalMessageId("user"),
        role: "user",
        content: message,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])

      // Add placeholder streaming message.
      streamingTextRef.current = ""
      pendingSessionRef.current = null
      sessionIdRef.current = null
      setSessionId(null)

      const streamingMsg: ChatMessageDisplay = {
        id: nextLocalMessageId("streaming"),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        streaming: true,
      }
      setMessages((prev) => [...prev, streamingMsg])
      statusRef.current = "thinking"
      setStatus("thinking")
      setActiveToolName(null)

      try {
        await window.api.chatSendMessage(
          workflowPath,
          message,
          selectedProject,
          workflowRef.current,
        )
      } catch (err) {
        resetLocalSessionState()
        // Remove optimistic user+streaming messages on immediate failure.
        setMessages((prev) =>
          prev.filter(
            (m) =>
              m.id !== userMsg.id && !(m.role === "assistant" && m.streaming),
          ),
        )
        const msg = errorToUserMessage(err).replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        )
        toastError(msg)
        addNotification({
          title: "Agent request failed",
          description: msg,
          level: "error",
          source: "agent",
        })
      }
    },
    [
      addNotification,
      nextLocalMessageId,
      workflowPath,
      selectedProject,
      resetLocalSessionState,
      setMessages,
      setSessionId,
      setStatus,
    ],
  )

  useEffect(() => {
    if (!workflowPath || !pendingCreateMessage) return
    if (historyLoadedWorkflowPath !== workflowPath) return
    if (status !== "idle") return

    const message = pendingCreateMessage[workflowPath]
    if (!message) return
    setPendingCreateMessage((prev) => {
      const next = { ...prev }
      delete next[workflowPath]
      return next
    })
    void sendMessage(message)
  }, [
    historyLoadedWorkflowPath,
    pendingCreateMessage,
    sendMessage,
    setPendingCreateMessage,
    status,
    workflowPath,
  ])

  const cancel = useCallback(async () => {
    const activeSessionId = sessionIdRef.current || pendingSessionRef.current
    if (activeSessionId) {
      try {
        await window.api.chatCancel(activeSessionId)
      } catch (err) {
        console.error("[useChatSession] chatCancel failed:", err)
      }
    }

    resetLocalSessionState()
    removeStreamingPlaceholder()
  }, [resetLocalSessionState, removeStreamingPlaceholder])

  const clearHistory = useCallback(async () => {
    if (!workflowPath) return

    const activeSessionId = sessionIdRef.current || pendingSessionRef.current
    if (!activeSessionId && statusRef.current !== "idle") {
      toastError(
        "Please wait for the Agent session to initialize before clearing history.",
      )
      return
    }

    if (activeSessionId) {
      try {
        await window.api.chatCancel(activeSessionId)
      } catch (err) {
        console.error("[useChatSession] chatCancel before clear failed:", err)
        toastError("Could not stop the active Agent before clearing history.")
        addNotification({
          title: "Could not stop the active Agent",
          description: errorToUserMessage(err),
          level: "error",
          source: "agent",
        })
        return
      }
    }

    try {
      await window.api.chatClearHistory(workflowPath)
    } catch (err) {
      console.error("[useChatSession] chatClearHistory failed:", err)
      toastError("Could not clear Agent history")
      addNotification({
        title: "Could not clear Agent history",
        description: errorToUserMessage(err),
        level: "error",
        source: "agent",
      })
      return
    }

    resetLocalSessionState()
    removeStreamingPlaceholder()
    setMessages([])
    setUndoStack([])
  }, [
    addNotification,
    workflowPath,
    resetLocalSessionState,
    removeStreamingPlaceholder,
    setMessages,
    setUndoStack,
  ])

  const undo = useCallback(() => {
    if (statusRef.current !== "idle") return
    setUndoStack((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      restoreWorkflowFromUndo(last)
      return prev.slice(0, -1)
    })
  }, [restoreWorkflowFromUndo, setUndoStack])

  return {
    messages,
    status,
    sessionId,
    undoStack,
    activeToolName,
    sendMessage,
    cancel,
    clearHistory,
    undo,
  }
}
