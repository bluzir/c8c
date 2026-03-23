import { describe, expect, it } from "vitest"
import {
  canReplaceCurrentWorkflow,
  getReplaceCurrentWorkflowBlockedReason,
} from "./run-guards"

describe("run guards", () => {
  it("blocks replacing the current workflow while a run is active", () => {
    expect(canReplaceCurrentWorkflow("starting")).toBe(false)
    expect(canReplaceCurrentWorkflow("running")).toBe(false)
    expect(canReplaceCurrentWorkflow("paused")).toBe(false)
    expect(canReplaceCurrentWorkflow("cancelling")).toBe(false)
    expect(getReplaceCurrentWorkflowBlockedReason("running")).toContain(
      "Stop the active run first",
    )
  })

  it("allows replacing the current workflow when no run is active", () => {
    expect(canReplaceCurrentWorkflow("idle")).toBe(true)
    expect(canReplaceCurrentWorkflow("done")).toBe(true)
    expect(canReplaceCurrentWorkflow("error")).toBe(true)
    expect(getReplaceCurrentWorkflowBlockedReason("idle")).toBeNull()
  })
})
