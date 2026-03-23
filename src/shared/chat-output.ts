export interface AssistantTurn {
  text: string
  hasToolCalls: boolean
}

const INTERNAL_BLOCK_TAGS = [
  "tool_result",
  "tool_results",
  "tool_response",
  "tool_call",
  "tool_use",
  "thinking",
  "result",
] as const

const INTERNAL_TAG_RE =
  /<\/?(?:tool_result|tool_results|tool_response|tool_call|tool_use|thinking|result)\b[^>]*>/gi
const INLINE_TOOL_CALL_LINE_RE = /^[ \t]*\{[^\n]*\}[ \t]*$/gm
const FENCED_BLOCK_RE = /```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)\n?```/g

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n")
}

function looksLikeToolCallPayload(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false

  const hasToolField = /(?:["']tool["']\s*:|(^|\n)\s*tool\s*:)/im.test(
    normalized,
  )
  const hasInputField =
    /(?:["'](?:input|arguments|params|parameters)["']\s*:|(^|\n)\s*(?:input|arguments|params|parameters)\s*:)/im.test(
      normalized,
    )
  const hasCallIdField =
    /(?:["'](?:call_id|callId|id)["']\s*:|(^|\n)\s*(?:call_id|callId|id)\s*:)/im.test(
      normalized,
    )

  return hasToolField && hasInputField && hasCallIdField
}

function stripFencedToolCalls(text: string): string {
  return text.replace(FENCED_BLOCK_RE, (block, content: string) =>
    looksLikeToolCallPayload(content) ? "\n" : block,
  )
}

function stripInlineToolCalls(text: string): string {
  return text.replace(INLINE_TOOL_CALL_LINE_RE, (line) =>
    looksLikeToolCallPayload(line) ? "\n" : line,
  )
}

function stripCompleteInternalBlocks(text: string): string {
  let cleaned = text

  for (const tag of INTERNAL_BLOCK_TAGS) {
    cleaned = cleaned.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"),
      "\n",
    )
  }

  return cleaned
}

function stripTrailingPartialInternalBlock(text: string): string {
  let cleaned = text

  for (const tag of INTERNAL_BLOCK_TAGS) {
    const openTagRe = new RegExp(`<${tag}\\b[^>]*>`, "gi")
    const matches = Array.from(cleaned.matchAll(openTagRe))
    const lastMatch = matches.at(-1)
    const start = lastMatch?.index
    if (typeof start !== "number") continue

    const suffix = cleaned.slice(start)
    if (new RegExp(`<\\/${tag}>`, "i").test(suffix)) continue
    cleaned = cleaned.slice(0, start).trimEnd()
  }

  return cleaned
}

function stripTrailingPartialToolFence(text: string): string {
  const fenceCount = (text.match(/```/g) || []).length
  if (fenceCount % 2 === 0) return text

  const start = text.lastIndexOf("```")
  if (start < 0) return text

  const suffix = text.slice(start + 3).replace(/^\s*(?:json|yaml|yml)?\s*/i, "")
  if (
    !looksLikeToolCallPayload(suffix) &&
    !/(?:["']tool["']\s*:|(^|\n)\s*tool\s*:)/im.test(suffix)
  ) {
    return text
  }

  return text.slice(0, start).trimEnd()
}

function stripTrailingPartialInlineToolCall(text: string): string {
  const lastLineBreak = text.lastIndexOf("\n")
  const lastLineStart = lastLineBreak >= 0 ? lastLineBreak + 1 : 0
  const lastLine = text.slice(lastLineStart)

  if (!/^\s*\{/.test(lastLine)) return text
  if (!/"tool"\s*:/.test(lastLine)) return text
  if (/\}\s*$/.test(lastLine)) return text

  return text.slice(0, lastLineStart).trimEnd()
}

export function sanitizeAssistantText(
  text: string,
  options: { streaming?: boolean } = {},
): string {
  let cleaned = normalizeLineBreaks(text)
  cleaned = stripFencedToolCalls(cleaned)

  if (options.streaming) {
    cleaned = stripTrailingPartialToolFence(cleaned)
  }

  cleaned = stripInlineToolCalls(cleaned)
  cleaned = stripCompleteInternalBlocks(cleaned)

  if (options.streaming) {
    cleaned = stripTrailingPartialInternalBlock(cleaned)
    cleaned = stripTrailingPartialInlineToolCall(cleaned)
  }

  return cleaned
    .replace(INTERNAL_TAG_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function selectAssistantTurnText(turns: AssistantTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (!turn.hasToolCalls && turn.text.trim()) {
      return turn.text
    }
  }

  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (turn.text.trim()) {
      return turn.text
    }
  }

  return ""
}
