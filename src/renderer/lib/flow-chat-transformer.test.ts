import { describe, it, expect } from "vitest"
import { buildDecisionMessage } from "./flow-chat-transformer"
import type { DecisionContent } from "./flow-chat-types"

describe("buildDecisionMessage", () => {
  it("creates approval-tone message from approval input", () => {
    const msg = buildDecisionMessage({
      type: "approval",
      runId: "run-1",
      nodeId: "approval-1",
      flowName: "Segment Research JTBD",
      content: "Full output text here...",
      message: "Review the segments before scoring",
    })

    expect(msg.content.type).toBe("decision")
    const data = msg.content.data as DecisionContent
    expect(data.tone).toBe("approval")
    expect(data.question).toContain("continue")
    expect(data.actions).toHaveLength(4)
    expect(data.actions[0].variant).toBe("primary")
    expect(msg.id).toBeTruthy()
  })

  it("creates eval-exhausted-tone message", () => {
    const msg = buildDecisionMessage({
      type: "eval-exhausted",
      runId: "run-1",
      nodeId: "evaluator-1",
      flowName: "Deep Research",
      score: 5,
      threshold: 7,
      attempt: 3,
      reason: "Signal coverage is weak",
      fixInstructions: "Improve source diversity",
      criteria: [
        { id: "Signal coverage", score: 4 },
        { id: "Grounding quality", score: 7 },
      ],
    })

    const data = msg.content.data as DecisionContent
    expect(data.tone).toBe("eval-exhausted")
    expect(data.issues.length).toBeGreaterThan(0)
    expect(data.question).toContain("accept")
    expect(data.actions.some((a) => a.label === "Stop & restart")).toBe(true)
  })
})
