import type { LogEntry } from "@shared/types"
import type { ToolDigestEntry, ToolActionEntry } from "./flow-chat-types"

/** Strip MCP `server__` prefix from tool names */
export function normalizeToolName(raw: string): string {
  return raw.split("__").pop() || raw
}

/** Increment count for a tool in the digest, or add it */
export function addToolToDigest(
  digest: ToolDigestEntry[] | undefined,
  toolName: string,
): ToolDigestEntry[] {
  const normalized = normalizeToolName(toolName)
  const entries = digest ? [...digest] : []
  const existing = entries.find((e) => e.tool === normalized)
  if (existing) {
    existing.count += 1
  } else {
    entries.push({ tool: normalized, count: 1 })
  }
  return entries
}

/** Build a full digest from a log entry array */
export function buildToolDigestFromLog(
  log: LogEntry[] | undefined,
): ToolDigestEntry[] | undefined {
  if (!log || log.length === 0) return undefined
  let digest: ToolDigestEntry[] | undefined
  for (const entry of log) {
    if (entry.type === "tool_use") {
      digest = addToolToDigest(digest, entry.tool)
    }
  }
  return digest
}

/** Known search tool names (after normalization) */
const SEARCH_TOOLS = new Set([
  "web_search",
  "web_search_exa",
  "web_search_serper",
  "WebSearch",
  "Search",
  "search",
  "brave_search",
  "tavily_search",
  "Grep",
])

/** Extract human-readable query from search tool input */
export function extractSearchQuery(
  tool: string,
  input: Record<string, unknown>,
): string | null {
  const normalized = normalizeToolName(tool)
  if (!SEARCH_TOOLS.has(normalized)) return null

  const query =
    (input.query as string) ??
    (input.search_query as string) ??
    (input.q as string) ??
    (input.pattern as string)

  if (!query || typeof query !== "string") return null

  // Truncate at 80 chars
  return query.length > 80 ? query.slice(0, 77) + "..." : query
}

const MAX_TOOL_ACTIONS = 15

function truncate(s: string, max: number): string {
  if (!s) return ""
  return s.length > max ? s.slice(0, max - 3) + "..." : s
}

function basename(path: string): string {
  return path.split("/").pop() || path
}

/** Build a human-readable action entry from a tool_use log entry */
export function buildToolAction(
  tool: string,
  input: Record<string, unknown>,
): ToolActionEntry {
  const normalized = normalizeToolName(tool)

  if (SEARCH_TOOLS.has(normalized)) {
    const query =
      (input.query as string) ??
      (input.search_query as string) ??
      (input.q as string) ??
      (input.pattern as string)
    return { kind: "search", label: truncate(query || normalized, 100) }
  }
  if (normalized === "Read") {
    const path = (input.file_path as string) || (input.path as string) || ""
    return { kind: "read", label: truncate(basename(path) || "file", 100) }
  }
  if (normalized === "Write") {
    const path = (input.file_path as string) || (input.path as string) || ""
    return { kind: "write", label: truncate(basename(path) || "file", 100) }
  }
  if (normalized === "Edit") {
    const path = (input.file_path as string) || (input.path as string) || ""
    return { kind: "edit", label: truncate(basename(path) || "file", 100) }
  }
  if (normalized === "Bash") {
    const cmd = (input.command as string) || ""
    return { kind: "command", label: truncate(cmd, 80) }
  }
  if (
    normalized === "WebFetch" ||
    normalized === "browse" ||
    normalized === "Browser"
  ) {
    const url = (input.url as string) || ""
    return { kind: "browse", label: truncate(url, 100) }
  }
  return { kind: "other", label: normalized }
}

/** Push a tool action to the array, capping at MAX_TOOL_ACTIONS */
export function pushToolAction(
  actions: ToolActionEntry[] | undefined,
  action: ToolActionEntry,
): ToolActionEntry[] {
  const arr = actions ? [...actions] : []
  if (arr.length < MAX_TOOL_ACTIONS) {
    arr.push(action)
  }
  return arr
}

/** Build tool actions from a full log (for rehydration from persisted data) */
export function buildToolActionsFromLog(
  log: LogEntry[] | undefined,
): ToolActionEntry[] | undefined {
  if (!log || log.length === 0) return undefined
  const actions: ToolActionEntry[] = []
  for (const entry of log) {
    if (entry.type === "tool_use" && actions.length < MAX_TOOL_ACTIONS) {
      actions.push(buildToolAction(entry.tool, entry.input))
    }
  }
  return actions.length > 0 ? actions : undefined
}

/** Format digest entries into human-readable parts like "5 files read" */
export function formatDigestParts(
  digest: ToolDigestEntry[] | undefined,
): string[] {
  if (!digest || digest.length === 0) return []

  const counts: Record<string, number> = {}
  for (const { tool, count } of digest) {
    counts[tool] = (counts[tool] || 0) + count
  }

  const parts: string[] = []
  if (counts["Read"]) parts.push(`${counts["Read"]} files read`)
  if (counts["Write"]) parts.push(`${counts["Write"]} files written`)
  if (counts["Edit"]) parts.push(`${counts["Edit"]} edits`)
  if (counts["Bash"]) parts.push(`${counts["Bash"]} commands`)

  // Aggregate all search-like tools
  const searchCount = Object.entries(counts)
    .filter(([k]) => SEARCH_TOOLS.has(k))
    .reduce((s, [, c]) => s + c, 0)
  if (searchCount) parts.push(`${searchCount} searches`)

  // Remaining tools not yet listed
  const knownKeys = new Set([
    "Read",
    "Write",
    "Edit",
    "Bash",
    ...SEARCH_TOOLS,
  ])
  for (const [tool, count] of Object.entries(counts)) {
    if (!knownKeys.has(tool)) {
      parts.push(`${count} ${tool}`)
    }
  }

  return parts
}
