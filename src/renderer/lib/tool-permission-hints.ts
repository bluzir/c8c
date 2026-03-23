import type { LogEntry } from "@shared/types"

export interface ToolPermissionHint {
  toolName: string
  domain?: string
}

const WEBFETCH_RE = /\bwebfetch\b/i
const FAILED_RE = /\bfailed\b|ошиб|не удалось|denied/i
const PERMISSION_RE = /\bpermission\b|allow tool|approve|разреш|одобр/i
const URL_DOMAIN_RE =
  /https?:\/\/([a-z0-9.-]+\.[a-z]{2,24})(?::\d+)?(?=[/?#:\s.,!]|$)/i
const DOMAIN_LABELED_RE =
  /\b(?:domain|site|website|сайт)\b[^a-z0-9]{0,8}([a-z0-9.-]+\.[a-z]{2,24})/i

function normalizeDomain(raw: string): string {
  return raw.toLowerCase().replace(/\.$/, "")
}

function extractDomain(text: string): string | undefined {
  const fromUrl = text.match(URL_DOMAIN_RE)
  if (fromUrl?.[1]) return normalizeDomain(fromUrl[1])

  const labeled = text.match(DOMAIN_LABELED_RE)
  if (labeled?.[1]) return normalizeDomain(labeled[1])

  return undefined
}

function parsePermissionHint(
  toolName: string,
  content: string,
): ToolPermissionHint | null {
  const tool = toolName || "unknown"
  const contentText = content || ""
  const mentionsWebFetch =
    WEBFETCH_RE.test(tool) || WEBFETCH_RE.test(contentText)
  if (!mentionsWebFetch) return null

  const isFailure =
    FAILED_RE.test(contentText) || PERMISSION_RE.test(contentText)
  if (!isFailure) return null

  return {
    toolName: "WebFetch",
    domain: extractDomain(contentText),
  }
}

export function getToolPermissionHint(
  entry: LogEntry,
): ToolPermissionHint | null {
  if (entry.type === "tool_result") {
    if (entry.status !== "error") return null
    return parsePermissionHint(entry.tool, entry.output)
  }

  if (entry.type === "error") {
    return parsePermissionHint("", entry.content)
  }

  return null
}
