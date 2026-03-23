function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readPath(source: unknown, path: string[]): unknown {
  let current = source
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function pickString(source: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path)
    if (typeof value === "string" && value.trim()) return value
  }
  return undefined
}

function pickRecord(
  source: unknown,
  paths: string[][],
): Record<string, unknown> | undefined {
  for (const path of paths) {
    const value = readPath(source, path)
    if (isRecord(value)) return value
  }
  return undefined
}

function pickArray(source: unknown, paths: string[][]): unknown[] | undefined {
  for (const path of paths) {
    const value = readPath(source, path)
    if (Array.isArray(value)) return value
  }
  return undefined
}

function coerceText(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    const combined = value
      .map((item) => {
        if (typeof item === "string") return item
        if (isRecord(item)) {
          if (typeof item.text === "string") return item.text
          if (typeof item.content === "string") return item.content
        }
        return ""
      })
      .join("")
      .trim()
    return combined || undefined
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") return value.text
    if (typeof value.content === "string") return value.content
  }
  return undefined
}

function eventKey(event: Record<string, unknown>): string {
  const type = typeof event.type === "string" ? event.type : ""
  const method = typeof event.method === "string" ? event.method : ""
  return `${type} ${method}`.toLowerCase()
}

function looksLikeSupportedLogEvent(event: Record<string, unknown>): boolean {
  return (
    typeof event.type === "string" &&
    [
      "assistant",
      "tool_use",
      "tool_result",
      "content_block_start",
      "message_start",
      "message_delta",
      "error",
    ].includes(event.type)
  )
}

function buildAssistantEvent(
  subtype: "text" | "thinking",
  content: string,
): string {
  return JSON.stringify({
    type: "assistant",
    subtype,
    content,
  })
}

function buildToolUseEvent(
  id: string,
  name: string,
  input: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: "tool_use",
    id,
    name,
    input,
  })
}

function buildToolResultEvent(
  toolUseId: string,
  name: string | undefined,
  content: string,
  isError: boolean,
): string {
  return JSON.stringify({
    type: "tool_result",
    tool_use_id: toolUseId,
    ...(name ? { name } : {}),
    content,
    is_error: isError,
  })
}

function extractToolName(event: Record<string, unknown>): string | undefined {
  return pickString(event, [
    ["name"],
    ["toolName"],
    ["tool_name"],
    ["call", "name"],
    ["tool_call", "name"],
    ["item", "name"],
    ["params", "name"],
    ["params", "tool_name"],
  ])
}

function extractToolId(event: Record<string, unknown>): string | undefined {
  return pickString(event, [
    ["id"],
    ["call_id"],
    ["toolCallId"],
    ["tool_call_id"],
    ["item", "id"],
    ["item", "call_id"],
    ["params", "id"],
    ["params", "call_id"],
    ["params", "tool_call_id"],
  ])
}

function extractToolInput(
  event: Record<string, unknown>,
): Record<string, unknown> {
  return (
    pickRecord(event, [
      ["input"],
      ["arguments"],
      ["args"],
      ["tool_input"],
      ["call", "input"],
      ["call", "arguments"],
      ["tool_call", "input"],
      ["params", "input"],
      ["params", "arguments"],
    ]) || {}
  )
}

function extractToolOutput(event: Record<string, unknown>): string | undefined {
  const direct = coerceText(
    pickString(event, [
      ["output"],
      ["result"],
      ["tool_output"],
      ["toolResult"],
      ["error"],
      ["message"],
    ]) ||
      pickArray(event, [
        ["output"],
        ["result"],
        ["content"],
        ["item", "content"],
        ["params", "result"],
      ]) ||
      pickRecord(event, [
        ["output"],
        ["result"],
        ["item", "output"],
        ["params", "result"],
      ]),
  )

  if (direct) return direct

  const content = pickArray(event, [
    ["content"],
    ["item", "content"],
    ["message", "content"],
  ])
  return coerceText(content)
}

function extractAssistantText(
  event: Record<string, unknown>,
): string | undefined {
  const delta = pickString(event, [
    ["delta"],
    ["text_delta"],
    ["content_delta"],
    ["params", "delta"],
    ["params", "text"],
    ["params", "content"],
    ["item", "text"],
    ["item", "delta"],
  ])
  if (delta) return delta

  const contentBlocks = pickArray(event, [
    ["content"],
    ["message", "content"],
    ["item", "content"],
    ["params", "content"],
  ])
  const content = coerceText(contentBlocks)
  if (content) return content

  return pickString(event, [
    ["text"],
    ["content"],
    ["message"],
    ["item", "message"],
  ])
}

export interface CodexJsonNormalizerState {
  toolNamesById: Map<string, string>
}

export function createCodexJsonNormalizerState(): CodexJsonNormalizerState {
  return {
    toolNamesById: new Map<string, string>(),
  }
}

export function normalizeCodexJsonLine(
  line: string,
  state: CodexJsonNormalizerState,
): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return []
  }

  if (!isRecord(parsed)) return []
  if (looksLikeSupportedLogEvent(parsed)) return [JSON.stringify(parsed)]

  const key = eventKey(parsed)
  const events: string[] = []

  if (key.includes("reasoning")) {
    const text = extractAssistantText(parsed)
    if (text) events.push(buildAssistantEvent("thinking", text))
    return events
  }

  if (
    key.includes("tool_call_begin") ||
    key.includes("tool/call") ||
    key.includes("item.started")
  ) {
    const toolName = extractToolName(parsed)
    if (toolName) {
      const toolId = extractToolId(parsed) || `${toolName}-${Date.now()}`
      state.toolNamesById.set(toolId, toolName)
      events.push(buildToolUseEvent(toolId, toolName, extractToolInput(parsed)))
      return events
    }
  }

  if (key.includes("tool_call_end") || key.includes("item.completed")) {
    const toolId = extractToolId(parsed)
    const knownToolName = toolId ? state.toolNamesById.get(toolId) : undefined
    const toolName = extractToolName(parsed) || knownToolName
    const output = extractToolOutput(parsed)
    if (toolId && output && toolName) {
      events.push(
        buildToolResultEvent(toolId, toolName, output, key.includes("error")),
      )
      return events
    }
  }

  if (
    key.includes("message") ||
    key.includes("text") ||
    key.includes("turn.completed") ||
    key.includes("item.completed")
  ) {
    const text = extractAssistantText(parsed)
    if (text) {
      events.push(buildAssistantEvent("text", text))
      return events
    }
  }

  if (key.includes("error")) {
    const message =
      pickString(parsed, [["message"], ["error"]]) || "Codex CLI error"
    events.push(JSON.stringify({ type: "error", error: message }))
  }

  return events
}
