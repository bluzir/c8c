import type { LogEntry } from "@shared/types"

// Matches research-interface's stream-json parsing approach.
// Claude CLI `--output-format stream-json` outputs NDJSON with Messages API-style events.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

interface ParseContext {
  toolNameByUseId: Map<string, string>
  lastToolName?: string
}

function createParseContext(): ParseContext {
  return { toolNameByUseId: new Map<string, string>() }
}

function extractToolResultOutput(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    const text = content
      .map((item) => {
        if (typeof item === "string") return item
        if (isRecord(item) && item.type === "text" && typeof item.text === "string") return item.text
        return ""
      })
      .filter(Boolean)
      .join("")
    if (text) return text
    return JSON.stringify(content)
  }
  if (isRecord(content)) {
    if (typeof content.text === "string") return content.text
    return JSON.stringify(content)
  }
  if (content == null) return ""
  return String(content)
}

function resolveToolName(block: Record<string, unknown>, ctx: ParseContext): string {
  if (typeof block.name === "string") return block.name
  if (typeof block.tool === "string") return block.tool
  const toolUseId = typeof block.tool_use_id === "string" ? block.tool_use_id : undefined
  if (toolUseId) {
    const mapped = ctx.toolNameByUseId.get(toolUseId)
    if (mapped) return mapped
  }
  return ctx.lastToolName || "unknown"
}

function extractContentBlocks(content: unknown, ctx: ParseContext): LogEntry[] {
  if (!Array.isArray(content)) return []
  const entries: LogEntry[] = []
  const timestamp = Date.now()

  for (const block of content) {
    if (!isRecord(block) || typeof block.type !== "string") continue

    if (block.type === "text" && typeof block.text === "string") {
      entries.push({ type: "text", content: block.text, timestamp })
    } else if (block.type === "thinking" && typeof block.thinking === "string") {
      entries.push({ type: "thinking", content: block.thinking, timestamp })
    } else if (block.type === "tool_use" && typeof block.name === "string") {
      ctx.lastToolName = block.name
      if (typeof block.id === "string") {
        ctx.toolNameByUseId.set(block.id, block.name)
      }
      entries.push({
        type: "tool_use",
        tool: block.name,
        input: isRecord(block.input) ? (block.input as Record<string, unknown>) : {},
        timestamp,
      })
    } else if (block.type === "tool_result") {
      const output = extractToolResultOutput(block.content)
      const toolName = resolveToolName(block, ctx)
      ctx.lastToolName = toolName
      entries.push({
        type: "tool_result",
        tool: toolName,
        output,
        status: block.is_error === true || block.isError === true ? "error" : "success",
        timestamp,
      })
    }
  }

  return entries
}

function formatElapsedSeconds(seconds: number): string {
  const safeSeconds = Math.max(1, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  if (minutes === 0) return `${safeSeconds}s`
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
}

function parseEvent(event: unknown, ctx: ParseContext): LogEntry[] {
  if (!isRecord(event)) return []

  // Unwrap stream_event wrapper
  if (event.type === "stream_event" && isRecord(event.event)) {
    return parseEvent(event.event, ctx)
  }

  const timestamp = Date.now()

  // Legacy CLI format: {"type":"assistant","subtype":"text","content":"string"}
  if (event.type === "assistant" && typeof event.subtype === "string") {
    if (event.subtype === "thinking" && typeof event.content === "string") {
      return [{ type: "thinking", content: event.content, timestamp }]
    }
    if (event.subtype === "text" && typeof event.content === "string") {
      return [{ type: "text", content: event.content, timestamp }]
    }
  }

  // Legacy CLI format: {"type":"tool_use","name":"Read","input":{...}}
  if (event.type === "tool_use" && typeof event.name === "string" && !Array.isArray(event.content)) {
    ctx.lastToolName = event.name
    if (typeof event.id === "string") {
      ctx.toolNameByUseId.set(event.id, event.name)
    }
    return [{
      type: "tool_use",
      tool: event.name,
      input: isRecord(event.input) ? (event.input as Record<string, unknown>) : {},
      timestamp,
    }]
  }

  // Legacy CLI format: {"type":"tool_result","name":"Read","content":"...","is_error":false}
  if (event.type === "tool_result") {
    const toolName = resolveToolName(event, ctx)
    ctx.lastToolName = toolName
    return [{
      type: "tool_result",
      tool: toolName,
      output: extractToolResultOutput(event.content),
      status: event.is_error === true || event.isError === true ? "error" : "success",
      timestamp,
    }]
  }

  // content_block_start (stream-json tool_use announcements)
  if (event.type === "content_block_start" && isRecord(event.content_block)) {
    return extractContentBlocks([event.content_block], ctx)
  }

  if (event.type === "tool_progress" && typeof event.tool_name === "string") {
    const elapsedSeconds = typeof event.elapsed_time_seconds === "number"
      ? formatElapsedSeconds(event.elapsed_time_seconds)
      : null
    return [{
      type: "text",
      content: `[progress] ${event.tool_name} is still running${elapsedSeconds ? ` (${elapsedSeconds})` : ""}`,
      timestamp,
    }]
  }

  if (event.type === "tool_use_summary" && typeof event.summary === "string") {
    return [{
      type: "text",
      content: `[progress] ${event.summary}`,
      timestamp,
    }]
  }

  if (event.type === "system" && event.subtype === "task_started" && typeof event.description === "string") {
    return [{
      type: "text",
      content: `[progress] Started task: ${event.description}`,
      timestamp,
    }]
  }

  if (event.type === "system" && event.subtype === "task_notification" && typeof event.summary === "string") {
    const status = typeof event.status === "string" ? event.status : "updated"
    return [{
      type: "text",
      content: `[progress] Task ${status}: ${event.summary}`,
      timestamp,
    }]
  }

  // Messages API style: content as array of blocks
  const content = Array.isArray(event.content)
    ? event.content
    : isRecord(event.message) && Array.isArray((event.message as Record<string, unknown>).content)
      ? (event.message as Record<string, unknown>).content as unknown[]
      : undefined

  if (content) {
    return extractContentBlocks(content, ctx)
  }

  // Error events
  if (event.type === "error") {
    const errText = typeof event.error === "string"
      ? event.error
      : typeof event.message === "string"
        ? event.message
        : "Unknown error"
    return [{ type: "error", content: errText, timestamp }]
  }

  // Fallback: string message
  if (typeof event.message === "string" && event.message.trim()) {
    return [{ type: "text", content: event.message, timestamp }]
  }

  return []
}

export interface UsageStats {
  input_tokens: number
  output_tokens: number
}

/** Extract usage from message_delta or message events. Returns null if no usage found. */
function extractUsage(event: unknown): UsageStats | null {
  if (!isRecord(event)) return null

  // Unwrap stream_event wrapper
  if (event.type === "stream_event" && isRecord(event.event)) {
    return extractUsage(event.event)
  }

  // message_delta with usage (Messages API streaming)
  if (event.type === "message_delta" && isRecord(event.usage)) {
    const u = event.usage as Record<string, unknown>
    if (typeof u.output_tokens === "number") {
      return {
        input_tokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
        output_tokens: u.output_tokens,
      }
    }
  }

  // message_start with usage (Messages API streaming — initial input token count)
  if (event.type === "message_start" && isRecord(event.message)) {
    const msg = event.message as Record<string, unknown>
    if (isRecord(msg.usage)) {
      const u = msg.usage as Record<string, unknown>
      if (typeof u.input_tokens === "number") {
        return {
          input_tokens: u.input_tokens,
          output_tokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
        }
      }
    }
  }

  // Top-level usage field (some CLI formats)
  if (isRecord(event.usage)) {
    const u = event.usage as Record<string, unknown>
    if (typeof u.input_tokens === "number" || typeof u.output_tokens === "number") {
      return {
        input_tokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
        output_tokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
      }
    }
  }

  return null
}

export function parseLogLine(line: string): LogEntry | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  const entries = parseEvent(parsed, createParseContext())
  return entries.length > 0 ? entries[0] : null
}

export class LogParser {
  entries: LogEntry[] = []
  private _rawLines: string[] = []
  private _buffer = ""
  private _ctx = createParseContext()
  private _inputTokens = 0
  private _outputTokens = 0

  get rawOutput(): string {
    return this._rawLines.join("\n")
  }

  get textContent(): string {
    return this.entries
      .filter((e): e is Extract<LogEntry, { type: "text" }> => e.type === "text")
      .map((e) => e.content)
      .join("")
  }

  get usage(): UsageStats {
    return { input_tokens: this._inputTokens, output_tokens: this._outputTokens }
  }

  appendEntry(entry: LogEntry): void {
    this.entries.push(entry)
  }

  appendEntries(entries: LogEntry[]): void {
    this.entries.push(...entries)
  }

  applyUsage(
    usage: Partial<UsageStats> & {
      inputTokens?: number
      outputTokens?: number
    },
  ): boolean {
    const nextInput = typeof usage.input_tokens === "number"
      ? usage.input_tokens
      : typeof usage.inputTokens === "number"
        ? usage.inputTokens
        : undefined
    const nextOutput = typeof usage.output_tokens === "number"
      ? usage.output_tokens
      : typeof usage.outputTokens === "number"
        ? usage.outputTokens
        : undefined

    let changed = false
    if (typeof nextInput === "number" && nextInput > this._inputTokens) {
      this._inputTokens = nextInput
      changed = true
    }
    if (typeof nextOutput === "number" && nextOutput > this._outputTokens) {
      this._outputTokens = nextOutput
      changed = true
    }
    return changed
  }

  feed(line: string): LogEntry[] {
    this._rawLines.push(line)
    let parsed: unknown
    try {
      parsed = JSON.parse(line.trim())
    } catch {
      return []
    }

    // Check for usage stats (message_start gives input, message_delta gives output)
    const usage = extractUsage(parsed)
    if (usage) {
      this.applyUsage(usage)
    }

    const newEntries = parseEvent(parsed, this._ctx)
    this.entries.push(...newEntries)
    return newEntries
  }

  feedChunk(chunk: string): LogEntry[] {
    this._buffer += chunk
    const lines = this._buffer.split("\n")
    this._buffer = lines.pop() || ""

    const newEntries: LogEntry[] = []
    for (const line of lines) {
      if (line.trim()) {
        const entries = this.feed(line)
        newEntries.push(...entries)
      }
    }
    return newEntries
  }

  flush(): LogEntry[] {
    if (this._buffer.trim()) {
      const entries = this.feed(this._buffer)
      this._buffer = ""
      return entries
    }
    return []
  }
}
