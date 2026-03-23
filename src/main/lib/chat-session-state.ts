import type {
  ChatEvent,
  ChatMessage,
  ChatSessionMessage,
  ChatSessionSnapshot,
  ChatSessionStatus,
  Workflow,
} from "@shared/types"

interface ActiveChatSessionRecord {
  workflowPath: string
  sessionId: string
  status: ChatSessionStatus
  activeToolName: string | null
  workflow: Workflow | null
  messages: ChatSessionMessage[]
  updatedAt: number
}

const activeChatSessionsById = new Map<string, ActiveChatSessionRecord>()
const activeChatSessionIdByWorkflow = new Map<string, string>()

function cloneMessage(message: ChatSessionMessage): ChatSessionMessage {
  return {
    ...message,
    toolInput: message.toolInput
      ? structuredClone(message.toolInput)
      : undefined,
  }
}

function cloneSnapshot(record: ActiveChatSessionRecord): ChatSessionSnapshot {
  return {
    workflowPath: record.workflowPath,
    sessionId: record.sessionId,
    status: record.status,
    activeToolName: record.activeToolName,
    workflow: record.workflow ? structuredClone(record.workflow) : null,
    messages: record.messages.map(cloneMessage),
    updatedAt: record.updatedAt,
  }
}

function createStreamingPlaceholder(
  sessionId: string,
  timestamp: number,
): ChatSessionMessage {
  return {
    id: `streaming-${sessionId}`,
    role: "assistant",
    content: "",
    timestamp,
    streaming: true,
  }
}

function ensureStreamingPlaceholder(
  record: ActiveChatSessionRecord,
): ChatSessionMessage {
  const existing = record.messages.find(
    (message) => message.role === "assistant" && message.streaming,
  )
  if (existing) return existing

  const placeholder = createStreamingPlaceholder(record.sessionId, Date.now())
  record.messages.push(placeholder)
  return placeholder
}

function removeStreamingPlaceholder(record: ActiveChatSessionRecord): void {
  record.messages = record.messages.filter(
    (message) => !(message.role === "assistant" && message.streaming),
  )
}

function toSessionMessage(message: ChatMessage): ChatSessionMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    toolName: message.toolName,
    toolInput: message.toolInput
      ? structuredClone(message.toolInput)
      : undefined,
    toolCallId: message.toolCallId,
    toolOutput: message.toolOutput,
    toolError: message.toolError,
  }
}

export function beginActiveChatSession(
  workflowPath: string,
  sessionId: string,
  messages: ChatMessage[],
  workflow: Workflow,
): void {
  const timestamp = Date.now()
  const record: ActiveChatSessionRecord = {
    workflowPath,
    sessionId,
    status: "thinking",
    activeToolName: null,
    workflow: structuredClone(workflow),
    messages: [
      ...messages.map(toSessionMessage),
      createStreamingPlaceholder(sessionId, timestamp),
    ],
    updatedAt: timestamp,
  }
  activeChatSessionsById.set(sessionId, record)
  activeChatSessionIdByWorkflow.set(workflowPath, sessionId)
}

export function applyChatEventToActiveSession(event: ChatEvent): void {
  const record = activeChatSessionsById.get(event.sessionId)
  if (!record) return

  record.updatedAt = Date.now()

  switch (event.type) {
    case "thinking": {
      record.status = "thinking"
      break
    }
    case "text-delta": {
      record.status = "streaming"
      record.activeToolName = null
      const placeholder = ensureStreamingPlaceholder(record)
      placeholder.content += event.content
      break
    }
    case "tool-call": {
      record.activeToolName = event.toolName
      record.messages.push({
        id: `tc-${event.toolCallId}`,
        role: "tool_call",
        content: "",
        timestamp: Date.now(),
        toolName: event.toolName,
        toolInput: structuredClone(event.toolInput),
        toolCallId: event.toolCallId,
      })
      break
    }
    case "tool-result": {
      record.activeToolName = null
      record.messages.push({
        id: `tr-${event.toolCallId}`,
        role: "tool_result",
        content: event.toolOutput || event.toolError || "",
        timestamp: Date.now(),
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        toolOutput: event.toolOutput,
        toolError: event.toolError,
      })
      break
    }
    case "message-complete": {
      removeStreamingPlaceholder(record)
      if (event.message.content.trim()) {
        record.messages.push(toSessionMessage(event.message))
      }
      record.activeToolName = null
      record.status = "streaming"
      break
    }
    case "workflow-mutated": {
      record.workflow = structuredClone(event.workflow)
      break
    }
    case "turn-complete": {
      record.workflow = structuredClone(event.workflow)
      record.activeToolName = null
      record.status = "idle"
      break
    }
    case "error": {
      removeStreamingPlaceholder(record)
      record.activeToolName = null
      record.status = "error"
      record.messages.push({
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `**Agent error:** ${event.content || "Agent error"}`,
        timestamp: Date.now(),
      })
      break
    }
  }
}

export function getActiveChatSessionSnapshot(
  workflowPath: string,
): ChatSessionSnapshot | null {
  const sessionId = activeChatSessionIdByWorkflow.get(workflowPath)
  if (!sessionId) return null
  const record = activeChatSessionsById.get(sessionId)
  if (!record) {
    activeChatSessionIdByWorkflow.delete(workflowPath)
    return null
  }
  return cloneSnapshot(record)
}

export function clearActiveChatSession(sessionId: string): void {
  const record = activeChatSessionsById.get(sessionId)
  if (!record) return
  activeChatSessionsById.delete(sessionId)
  if (activeChatSessionIdByWorkflow.get(record.workflowPath) === sessionId) {
    activeChatSessionIdByWorkflow.delete(record.workflowPath)
  }
}
