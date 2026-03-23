import { describe, expect, it } from "vitest"
import type { PreflightWarning } from "./preflight"
import {
  canStartManualContinuation,
  filterExecutionStartWarnings,
} from "./useExecutionCommands"

describe("canStartManualContinuation", () => {
  it("allows resuming from a paused run", () => {
    expect(canStartManualContinuation("paused")).toBe(true)
    expect(canStartManualContinuation("idle")).toBe(true)
    expect(canStartManualContinuation("failed")).toBe(true)
  })

  it("blocks continuation while a run is actively starting or running", () => {
    expect(canStartManualContinuation("starting")).toBe(false)
    expect(canStartManualContinuation("running")).toBe(false)
    expect(canStartManualContinuation("cancelling")).toBe(false)
  })
})

describe("filterExecutionStartWarnings", () => {
  const tokenBudgetWarning: PreflightWarning = {
    kind: "token_budget",
    title: "High estimated cost",
    message: "This flow could use up to ~$16.07 in the worst case. Continue?",
    detail: "2 skill steps, 1 splitter = up to 103 invocations",
    estimatedCostUsd: 16.07,
    worstCaseInvocations: 103,
  }

  it("keeps warnings for a normal run", () => {
    expect(
      filterExecutionStartWarnings([tokenBudgetWarning], "default"),
    ).toEqual([tokenBudgetWarning])
  })

  it("suppresses token budget warnings when resuming from a selected step", () => {
    expect(
      filterExecutionStartWarnings([tokenBudgetWarning], "skip_token_budget"),
    ).toEqual([])
  })
})
