import { describe, expect, it } from "vitest"
import { resolveReviewShellState } from "./useWorkflowPanelShellDerivations"

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
