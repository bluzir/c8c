import { describe, expect, it } from "vitest"
import { resolveWorkflowRunDisplayState } from "./workflow-run-display-state"

describe("resolveWorkflowRunDisplayState", () => {
  it("treats in-flight approvals as blocked attention state without pretending the run is terminal", () => {
    expect(resolveWorkflowRunDisplayState({
      runStatus: "running",
      runOutcome: null,
      approvalCount: 2,
    })).toEqual({
      state: "blocked",
      label: "Waiting for approval",
      tone: "warning",
      isInFlight: true,
      isTerminal: false,
      needsAttention: true,
      isFailure: false,
    })
  })

  it("treats blocked done runs as terminal approval state", () => {
    expect(resolveWorkflowRunDisplayState({
      runStatus: "done",
      runOutcome: "blocked",
    })).toEqual({
      state: "blocked",
      label: "Needs approval",
      tone: "warning",
      isInFlight: false,
      isTerminal: true,
      needsAttention: true,
      isFailure: false,
    })
  })

  it("keeps paused distinct from blocked", () => {
    expect(resolveWorkflowRunDisplayState({
      runStatus: "paused",
      runOutcome: null,
      approvalCount: 1,
    })).toMatchObject({
      state: "paused",
      label: "Paused",
      tone: "warning",
      isInFlight: true,
      isTerminal: false,
    })
  })

  it("treats interrupted runs as failures", () => {
    expect(resolveWorkflowRunDisplayState({
      runStatus: "done",
      runOutcome: "interrupted",
    })).toMatchObject({
      state: "failed",
      label: "Interrupted",
      tone: "danger",
      needsAttention: true,
      isFailure: true,
    })
  })

  it("does not let stale lastError override an explicit completed outcome", () => {
    expect(resolveWorkflowRunDisplayState({
      runStatus: "done",
      runOutcome: "completed",
      lastError: "old failure",
    })).toMatchObject({
      state: "completed",
      label: "Completed",
      tone: "success",
      needsAttention: false,
      isFailure: false,
    })
  })
})
