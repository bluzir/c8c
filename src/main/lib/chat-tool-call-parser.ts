import YAML from "yaml"

export interface ParsedToolCall {
  tool: string
  callId: string
  input: Record<string, unknown>
}

interface ParsedToolCallDraft {
  tool: string
  callId?: string
  input: Record<string, unknown>
}

const FENCED_BLOCK_RE = /```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```/g
const DIRECT_TOOL_CALL_INTENT_RE =
  /\b(execute|run|apply|invoke)\b[\s\S]{0,50}\btool\s*call\b/i
const TOOL_RESPONSE_TAG_RE =
  /<tool_response\b[^>]*>([\s\S]*?)<\/tool_response>/gi

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function tryParseJsonc(text: string): unknown | null {
  const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, "")
  const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, "")
  const withoutTrailingCommas = withoutLineComments
    .replace(/,\s*([}\]])/g, "$1")
    .trim()
  if (!withoutTrailingCommas) return null
  return tryParseJson(withoutTrailingCommas)
}

function tryParseYaml(text: string): unknown | null {
  try {
    return YAML.parse(text)
  } catch {
    return null
  }
}

function extractBalancedJsonObjects(text: string): string[] {
  const objects: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{") {
      if (depth === 0) start = i
      depth++
      continue
    }

    if (char === "}" && depth > 0) {
      depth--
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }

  return objects
}

function normalizeToolCall(value: unknown): ParsedToolCallDraft[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeToolCall(entry))
  }

  if (!isRecord(value)) return []
  const explicitTool =
    typeof value.tool === "string"
      ? value.tool
      : typeof value.tool_name === "string"
        ? value.tool_name
        : null

  const implicitTool =
    typeof value.name === "string" &&
    (isRecord(value.input) ||
      isRecord(value.arguments) ||
      isRecord(value.params) ||
      isRecord(value.parameters)) &&
    (typeof value.call_id === "string" ||
      typeof value.callId === "string" ||
      typeof value.id === "string")
      ? value.name
      : null

  const tool = (explicitTool || implicitTool || "").trim()
  if (!tool) return []

  const callId =
    typeof value.call_id === "string"
      ? value.call_id
      : typeof value.callId === "string"
        ? value.callId
        : typeof value.id === "string"
          ? value.id
          : undefined

  const rawInput = isRecord(value.input)
    ? value.input
    : isRecord(value.arguments)
      ? value.arguments
      : isRecord(value.params)
        ? value.params
        : isRecord(value.parameters)
          ? value.parameters
          : {}

  return [
    {
      tool,
      callId,
      input: rawInput,
    },
  ]
}

function parseToolCallsFromCandidate(candidate: string): ParsedToolCallDraft[] {
  const parsedValues: unknown[] = []
  const trimmed = candidate.trim()
  if (!trimmed) return []

  const direct = tryParseJson(trimmed)
  if (direct !== null) parsedValues.push(direct)
  const directJsonc = tryParseJsonc(trimmed)
  if (directJsonc !== null) parsedValues.push(directJsonc)

  const objectCandidates = extractBalancedJsonObjects(trimmed)
  for (const objectText of objectCandidates) {
    const parsedObject = tryParseJson(objectText)
    if (parsedObject !== null) parsedValues.push(parsedObject)
    const parsedObjectJsonc = tryParseJsonc(objectText)
    if (parsedObjectJsonc !== null) parsedValues.push(parsedObjectJsonc)
  }

  if (/(^|\n)\s*(tool|tool_name)\s*:/i.test(trimmed)) {
    const yamlParsed = tryParseYaml(trimmed)
    if (yamlParsed !== null) parsedValues.push(yamlParsed)
  }

  return parsedValues.flatMap((value) => normalizeToolCall(value))
}

export function parseToolCallsFromText(text: string): ParsedToolCall[] {
  const candidates = new Set<string>()
  const trimmed = text.trim()
  if (trimmed) candidates.add(trimmed)

  let match: RegExpExecArray | null
  const fencedBlockRe = new RegExp(
    FENCED_BLOCK_RE.source,
    FENCED_BLOCK_RE.flags,
  )
  while ((match = fencedBlockRe.exec(text)) !== null) {
    const content = match[1]?.trim()
    if (content) candidates.add(content)
  }

  const toolResponseTagRe = new RegExp(
    TOOL_RESPONSE_TAG_RE.source,
    TOOL_RESPONSE_TAG_RE.flags,
  )
  while ((match = toolResponseTagRe.exec(text)) !== null) {
    const content = match[1]?.trim()
    if (content) candidates.add(content)
  }

  const drafts = Array.from(candidates).flatMap((candidate) =>
    parseToolCallsFromCandidate(candidate),
  )

  const uniqueDrafts: ParsedToolCallDraft[] = []
  const draftSeen = new Set<string>()
  for (const draft of drafts) {
    const draftCallId = draft.callId?.trim() || ""
    const draftKey = `${draft.tool}\u0000${draftCallId}\u0000${JSON.stringify(draft.input)}`
    if (draftSeen.has(draftKey)) continue
    draftSeen.add(draftKey)
    uniqueDrafts.push(draft)
  }

  const calls: ParsedToolCall[] = []
  let fallbackIndex = 0

  for (const draft of uniqueDrafts) {
    const callId =
      draft.callId && draft.callId.trim()
        ? draft.callId.trim()
        : `tc-${fallbackIndex++}`
    calls.push({
      tool: draft.tool,
      callId,
      input: draft.input,
    })
  }

  return calls
}

export function shouldExecuteToolCallsDirectly(
  message: string,
  parsedCalls: ParsedToolCall[],
): boolean {
  if (parsedCalls.length === 0) return false
  if (DIRECT_TOOL_CALL_INTENT_RE.test(message)) return true

  let residue = message.replace(/```[\s\S]*?```/g, " ")
  for (const fragment of extractBalancedJsonObjects(message)) {
    residue = residue.replace(fragment, " ")
  }

  residue = residue
    .replace(/[`"'{}\[\]:,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  // If text is mostly JSON + a short imperative suffix/prefix, execute directly.
  return residue.length <= 40
}
