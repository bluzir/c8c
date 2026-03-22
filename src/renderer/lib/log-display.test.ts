import { describe, expect, it } from "vitest"
import type { LogEntry } from "@shared/types"
import { mergeLogEntriesForDisplay } from "./log-display"

describe("mergeLogEntriesForDisplay", () => {
  it("merges consecutive thinking and text chunks into single display blocks", () => {
    const log: LogEntry[] = [
      { type: "thinking", content: "thinking...\n to", timestamp: 1 },
      { type: "thinking", content: "\n the", timestamp: 2 },
      { type: "text", content: "[", timestamp: 3 },
      { type: "text", content: "{\"name\":\"Security\"", timestamp: 4 },
      { type: "tool_use", tool: "Read", input: { file_path: "a.md" }, timestamp: 5 },
      { type: "text", content: " after tool", timestamp: 6 },
    ]

    expect(mergeLogEntriesForDisplay(log)).toEqual([
      { type: "thinking", content: "thinking...\n to\n the", timestamp: 2 },
      { type: "text", content: "[{\"name\":\"Security\"", timestamp: 4 },
      { type: "tool_use", tool: "Read", input: { file_path: "a.md" }, timestamp: 5 },
      { type: "text", content: " after tool", timestamp: 6 },
    ])
  })

  it("merges consecutive error lines but keeps different entry types separate", () => {
    const log: LogEntry[] = [
      { type: "error", content: "line one\n", timestamp: 1 },
      { type: "error", content: "line two", timestamp: 2 },
      { type: "diff", content: "diff --git a", files: ["a.ts"], timestamp: 3 },
    ]

    expect(mergeLogEntriesForDisplay(log)).toEqual([
      { type: "error", content: "line one\nline two", timestamp: 2 },
      { type: "diff", content: "diff --git a", files: ["a.ts"], timestamp: 3 },
    ])
  })

  it("keeps progress text entries separate from normal text chunks", () => {
    const log: LogEntry[] = [
      { type: "text", content: "assistant prefix ", timestamp: 1 },
      { type: "text", content: "[progress] Read is still running (15s)", timestamp: 2 },
      { type: "text", content: "assistant suffix", timestamp: 3 },
    ]

    expect(mergeLogEntriesForDisplay(log)).toEqual(log)
  })
})
