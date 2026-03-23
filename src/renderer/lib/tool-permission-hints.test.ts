import { describe, expect, it } from "vitest"
import type { LogEntry } from "@shared/types"
import { getToolPermissionHint } from "./tool-permission-hints"

describe("getToolPermissionHint", () => {
  it("detects WebFetch permission failure from tool_result and extracts domain", () => {
    const entry: LogEntry = {
      type: "tool_result",
      tool: "WebFetch",
      output:
        "WebFetch failed. Need permission to load https://nhc.works for audit.",
      status: "error",
      timestamp: Date.now(),
    }

    const hint = getToolPermissionHint(entry)
    expect(hint).toEqual({
      toolName: "WebFetch",
      domain: "nhc.works",
    })
  })

  it("detects WebFetch permission failure from stderr/error text", () => {
    const entry: LogEntry = {
      type: "error",
      content:
        "I need permission to use WebFetch. Please allow tool in settings.",
      timestamp: Date.now(),
    }

    const hint = getToolPermissionHint(entry)
    expect(hint).toEqual({
      toolName: "WebFetch",
      domain: undefined,
    })
  })

  it("does not create hint for successful WebFetch tool result", () => {
    const entry: LogEntry = {
      type: "tool_result",
      tool: "WebFetch",
      output: "Loaded page successfully",
      status: "success",
      timestamp: Date.now(),
    }

    expect(getToolPermissionHint(entry)).toBeNull()
  })

  it("does not create hint for non-WebFetch tool failures", () => {
    const entry: LogEntry = {
      type: "tool_result",
      tool: "Read",
      output: "Read failed: missing file",
      status: "error",
      timestamp: Date.now(),
    }

    expect(getToolPermissionHint(entry)).toBeNull()
  })
})
