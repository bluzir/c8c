import { describe, expect, it } from "vitest"
import {
  resolveReviewShellState,
  resolveShowIdleStageContract,
} from "./useWorkflowPanelShellDerivations"

describe("resolveReviewShellState", () => {
  it("maps saved run outcomes to terminal shell states", () => {
    expect(resolveReviewShellState("completed")).toBe("completed")
    expect(resolveReviewShellState("failed")).toBe("failed")
    expect(resolveReviewShellState("cancelled")).toBe("cancelled")
    expect(resolveReviewShellState("interrupted")).toBe("cancelled")
    expect(resolveReviewShellState("blocked")).toBe("blocked")
  })

  it("ignores non-reviewable run states", () => {
    expect(resolveReviewShellState("running")).toBeNull()
    expect(resolveReviewShellState("paused")).toBeNull()
    expect(resolveReviewShellState(null)).toBeNull()
  })
})

describe("resolveShowIdleStageContract", () => {
  it("keeps the stage contract visible for fresh starts", () => {
    expect(
      resolveShowIdleStageContract({
        viewMode: "list",
        primaryScreenState: "fresh_start",
        showCreateDraftSkeleton: false,
        showAnyReviewMode: false,
        idleStageContract: { title: "Stage contract" },
        effectiveResumeHeader: false,
      }),
    ).toBe(true)
  })

  it("hides the stage contract when the resume header owns the state", () => {
    expect(
      resolveShowIdleStageContract({
        viewMode: "list",
        primaryScreenState: "cross_flow_handoff",
        showCreateDraftSkeleton: false,
        showAnyReviewMode: false,
        idleStageContract: { title: "Stage contract" },
        effectiveResumeHeader: true,
      }),
    ).toBe(false)
  })
})
