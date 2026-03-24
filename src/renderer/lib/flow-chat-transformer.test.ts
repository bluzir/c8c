import { describe, it, expect } from "vitest"
import { buildDecisionMessage, buildCompleteMessage } from "./flow-chat-transformer"
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

describe("buildCompleteMessage", () => {
  it("creates complete message with artifacts and follow-ups", () => {
    const msg = buildCompleteMessage({
      runId: "run-1",
      flowName: "Segment Research JTBD",
      summary: "Researched 8 segments for AI design tools.",
      findings: ["Best segment: freelance designers (score 8.2)"],
      limitations: ["Studios <5 people: only 2 price signals"],
      artifacts: [
        { name: "segment-report.md", path: "/workspace/segment-report.md", kind: "research_pack" },
      ],
      followUps: [
        { label: "Build JTBD positioning", emoji: "💎", source: "recommended_next" as const, templateId: "indispensable-jtbd-pipeline" },
      ],
      durationMs: 240000,
      costUsd: 0.08,
    })

    expect(msg.content.type).toBe("complete")
    expect(msg.content.data.artifacts).toHaveLength(1)
    expect(msg.content.data.followUps).toHaveLength(1)
    expect(msg.content.data.metrics.duration).toBe("4 min")
    expect(msg.content.data.metrics.cost).toBe("$0.08")
  })

  it("caps follow-ups at 3", () => {
    const msg = buildCompleteMessage({
      runId: "run-1",
      flowName: "Test",
      summary: "Done",
      findings: [],
      limitations: [],
      artifacts: [],
      followUps: [
        { label: "A", emoji: "1", source: "contextual" as const },
        { label: "B", emoji: "2", source: "recommended_next" as const },
        { label: "C", emoji: "3", source: "recommended_next" as const },
        { label: "D", emoji: "4", source: "recommended_next" as const },
        { label: "E", emoji: "5", source: "recommended_next" as const },
      ],
      durationMs: 60000,
      costUsd: 0.01,
    })

    expect(msg.content.data.followUps).toHaveLength(3)
    // Contextual first, then recommended_next
    expect(msg.content.data.followUps[0].source).toBe("contextual")
  })

  it("caps artifacts at 3", () => {
    const msg = buildCompleteMessage({
      runId: "run-1",
      flowName: "Test",
      summary: "Done",
      findings: [],
      limitations: [],
      artifacts: Array.from({ length: 8 }, (_, i) => ({
        name: `file-${i}.md`, path: `/workspace/file-${i}.md`, kind: "report",
      })),
      followUps: [],
      durationMs: 10000,
      costUsd: 0.01,
    })

    expect(msg.content.data.artifacts).toHaveLength(3)
  })
})
