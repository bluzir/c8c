import { describe, it, expect } from "vitest"
import {
  normalizeToolName,
  addToolToDigest,
  buildToolDigestFromLog,
  extractSearchQuery,
  formatDigestParts,
  buildToolAction,
  pushToolAction,
  buildToolActionsFromLog,
} from "./tool-digest"
import type { LogEntry } from "@shared/types"

describe("normalizeToolName", () => {
  it("strips server__ prefix", () => {
    expect(normalizeToolName("exa__web_search_exa")).toBe("web_search_exa")
  })

  it("strips nested server prefixes", () => {
    expect(normalizeToolName("mcp__serper__search")).toBe("search")
  })

  it("returns plain tool name unchanged", () => {
    expect(normalizeToolName("Read")).toBe("Read")
  })

  it("handles empty string", () => {
    expect(normalizeToolName("")).toBe("")
  })
})

describe("addToolToDigest", () => {
  it("adds new tool to empty digest", () => {
    const result = addToolToDigest(undefined, "Read")
    expect(result).toEqual([{ tool: "Read", count: 1 }])
  })

  it("increments existing tool", () => {
    const result = addToolToDigest([{ tool: "Read", count: 2 }], "Read")
    expect(result).toEqual([{ tool: "Read", count: 3 }])
  })

  it("adds new tool alongside existing", () => {
    const result = addToolToDigest([{ tool: "Read", count: 1 }], "Bash")
    expect(result).toEqual([
      { tool: "Read", count: 1 },
      { tool: "Bash", count: 1 },
    ])
  })

  it("normalizes MCP prefixed tool names", () => {
    const result = addToolToDigest(undefined, "exa__web_search_exa")
    expect(result).toEqual([{ tool: "web_search_exa", count: 1 }])
  })
})

describe("buildToolDigestFromLog", () => {
  it("returns undefined for empty log", () => {
    expect(buildToolDigestFromLog([])).toBeUndefined()
    expect(buildToolDigestFromLog(undefined)).toBeUndefined()
  })

  it("counts tool_use entries correctly", () => {
    const log: LogEntry[] = [
      { type: "tool_use", tool: "Read", input: { file: "a.ts" }, timestamp: 1 },
      { type: "thinking", content: "hmm", timestamp: 2 },
      { type: "tool_use", tool: "Read", input: { file: "b.ts" }, timestamp: 3 },
      { type: "tool_use", tool: "Bash", input: { command: "ls" }, timestamp: 4 },
      { type: "text", content: "done", timestamp: 5 },
    ]
    const result = buildToolDigestFromLog(log)
    expect(result).toEqual([
      { tool: "Read", count: 2 },
      { tool: "Bash", count: 1 },
    ])
  })

  it("normalizes MCP tool names in log", () => {
    const log: LogEntry[] = [
      { type: "tool_use", tool: "exa__web_search_exa", input: { query: "test" }, timestamp: 1 },
      { type: "tool_use", tool: "exa__web_search_exa", input: { query: "test2" }, timestamp: 2 },
    ]
    const result = buildToolDigestFromLog(log)
    expect(result).toEqual([{ tool: "web_search_exa", count: 2 }])
  })
})

describe("extractSearchQuery", () => {
  it("extracts query from web_search tool", () => {
    expect(
      extractSearchQuery("web_search", { query: "Claude Code features" }),
    ).toBe("Claude Code features")
  })

  it("extracts search_query field", () => {
    expect(
      extractSearchQuery("web_search_exa", { search_query: "AI agents 2026" }),
    ).toBe("AI agents 2026")
  })

  it("extracts q field", () => {
    expect(
      extractSearchQuery("brave_search", { q: "MCP protocol" }),
    ).toBe("MCP protocol")
  })

  it("extracts pattern from Grep tool", () => {
    expect(
      extractSearchQuery("Grep", { pattern: "handleProgressEvent" }),
    ).toBe("handleProgressEvent")
  })

  it("returns null for non-search tool", () => {
    expect(
      extractSearchQuery("Read", { file: "test.ts" }),
    ).toBeNull()
  })

  it("returns null when no query field found", () => {
    expect(
      extractSearchQuery("web_search", { url: "https://example.com" }),
    ).toBeNull()
  })

  it("truncates long queries at 80 chars", () => {
    const longQuery = "a".repeat(100)
    const result = extractSearchQuery("web_search", { query: longQuery })
    expect(result).toHaveLength(80)
    expect(result).toMatch(/\.\.\.$/u)
  })

  it("handles MCP-prefixed search tools", () => {
    expect(
      extractSearchQuery("exa__web_search_exa", { query: "test query" }),
    ).toBe("test query")
  })
})

describe("formatDigestParts", () => {
  it("returns empty array for undefined digest", () => {
    expect(formatDigestParts(undefined)).toEqual([])
    expect(formatDigestParts([])).toEqual([])
  })

  it("formats known tool types", () => {
    const digest = [
      { tool: "Read", count: 5 },
      { tool: "Edit", count: 2 },
      { tool: "Bash", count: 3 },
    ]
    const parts = formatDigestParts(digest)
    expect(parts).toEqual(["5 files read", "2 edits", "3 commands"])
  })

  it("aggregates search tools", () => {
    const digest = [
      { tool: "web_search_exa", count: 3 },
      { tool: "Grep", count: 2 },
    ]
    const parts = formatDigestParts(digest)
    expect(parts).toEqual(["5 searches"])
  })

  it("includes unknown tools by name", () => {
    const digest = [
      { tool: "Read", count: 1 },
      { tool: "CustomTool", count: 4 },
    ]
    const parts = formatDigestParts(digest)
    expect(parts).toContain("1 files read")
    expect(parts).toContain("4 CustomTool")
  })

  it("formats Write tool", () => {
    const digest = [{ tool: "Write", count: 2 }]
    expect(formatDigestParts(digest)).toEqual(["2 files written"])
  })
})

describe("buildToolAction", () => {
  it("creates search action from web_search tool", () => {
    const action = buildToolAction("web_search_exa", { query: "AI agents 2026" })
    expect(action).toEqual({ kind: "search", label: "AI agents 2026" })
  })

  it("creates read action with basename", () => {
    const action = buildToolAction("Read", { file_path: "/home/user/project/config.json" })
    expect(action).toEqual({ kind: "read", label: "config.json" })
  })

  it("creates write action with basename", () => {
    const action = buildToolAction("Write", { file_path: "/tmp/report.md" })
    expect(action).toEqual({ kind: "write", label: "report.md" })
  })

  it("creates edit action with basename", () => {
    const action = buildToolAction("Edit", { file_path: "/src/app.ts" })
    expect(action).toEqual({ kind: "edit", label: "app.ts" })
  })

  it("creates command action from Bash", () => {
    const action = buildToolAction("Bash", { command: "npm run test" })
    expect(action).toEqual({ kind: "command", label: "npm run test" })
  })

  it("creates browse action from WebFetch", () => {
    const action = buildToolAction("WebFetch", { url: "https://example.com/page" })
    expect(action).toEqual({ kind: "browse", label: "https://example.com/page" })
  })

  it("creates other action for unknown tools", () => {
    const action = buildToolAction("CustomTool", { data: "test" })
    expect(action).toEqual({ kind: "other", label: "CustomTool" })
  })

  it("normalizes MCP prefixed tool names", () => {
    const action = buildToolAction("exa__web_search_exa", { query: "test" })
    expect(action.kind).toBe("search")
    expect(action.label).toBe("test")
  })

  it("truncates long labels", () => {
    const action = buildToolAction("Bash", { command: "a".repeat(120) })
    expect(action.label.length).toBe(80)
    expect(action.label).toMatch(/\.\.\.$/u)
  })
})

describe("pushToolAction", () => {
  it("adds to empty array", () => {
    const result = pushToolAction(undefined, { kind: "read", label: "file.ts" })
    expect(result).toEqual([{ kind: "read", label: "file.ts" }])
  })

  it("appends to existing array", () => {
    const result = pushToolAction(
      [{ kind: "read", label: "a.ts" }],
      { kind: "search", label: "query" },
    )
    expect(result).toHaveLength(2)
  })

  it("caps at max entries", () => {
    const existing = Array.from({ length: 15 }, (_, i) => ({
      kind: "read" as const,
      label: `file${i}.ts`,
    }))
    const result = pushToolAction(existing, { kind: "read", label: "extra.ts" })
    expect(result).toHaveLength(15) // Not 16
  })
})

describe("buildToolActionsFromLog", () => {
  it("returns undefined for empty log", () => {
    expect(buildToolActionsFromLog(undefined)).toBeUndefined()
    expect(buildToolActionsFromLog([])).toBeUndefined()
  })

  it("builds actions from tool_use entries", () => {
    const log: LogEntry[] = [
      { type: "tool_use", tool: "Read", input: { file_path: "/a.ts" }, timestamp: 1 },
      { type: "thinking", content: "hmm", timestamp: 2 },
      { type: "tool_use", tool: "web_search_exa", input: { query: "test" }, timestamp: 3 },
    ]
    const actions = buildToolActionsFromLog(log)
    expect(actions).toEqual([
      { kind: "read", label: "a.ts" },
      { kind: "search", label: "test" },
    ])
  })

  it("skips non-tool_use entries", () => {
    const log: LogEntry[] = [
      { type: "thinking", content: "hmm", timestamp: 1 },
      { type: "text", content: "done", timestamp: 2 },
    ]
    expect(buildToolActionsFromLog(log)).toBeUndefined()
  })
})
