import { describe, expect, it } from "vitest"
import { LogParser } from "./log-parser"
import {
  buildAgentFailureDetail,
  hasPartialSkillProgress,
} from "./run-provider-execution"

describe("run-provider-execution", () => {
  it("surfaces Claude usage limit evidence before generic exit code", () => {
    const detail = buildAgentFailureDetail(
      "claude",
      {
        success: false,
        exitCode: 1,
        signal: null,
        killed: false,
        aborted: false,
        durationMs: 10,
        pid: 123,
        error: null,
        providerSessionId: null,
        backend: "claude_sdk",
      },
      new LogParser(),
      "HTTP 429 usage limit reached for this account",
    )

    expect(detail).toContain("Claude usage limit reached")
    expect(detail).toContain("HTTP 429 usage limit reached")
  })

  it("detects partial skill progress from successful write tools", () => {
    expect(hasPartialSkillProgress([
      {
        type: "tool_result",
        tool: "Write",
        status: "success",
        output: "created file",
        timestamp: Date.now(),
      },
    ], undefined)).toBe(true)
  })
})
