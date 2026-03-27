import { describe, it, expect } from "vitest"
import {
  buildDecisionMessage,
  buildCompleteMessage,
  buildErrorMessage,
  buildStartMessage,
  buildProgressMessage,
} from "./flow-chat-transformer"
import type {
  DecisionContent,
  CompleteContent,
  ErrorContent,
  StartContent,
  ProgressContent,
} from "./flow-chat-types"

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
        {
          name: "segment-report.md",
          path: "/workspace/segment-report.md",
          kind: "research_pack",
        },
      ],
      followUps: [
        {
          label: "Build JTBD positioning",
          emoji: "💎",
          source: "recommended_next" as const,
          templateId: "indispensable-jtbd-pipeline",
        },
      ],
      durationMs: 240000,
      costUsd: 0.08,
    })

    expect(msg.content.type).toBe("complete")
    const data = msg.content.data as CompleteContent
    expect(data.artifacts).toHaveLength(1)
    expect(data.followUps).toHaveLength(1)
    expect(data.metrics.duration).toBe("4 min")
    expect(data.metrics.cost).toBe("$0.08")
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

    const data = msg.content.data as CompleteContent
    expect(data.followUps).toHaveLength(3)
    // Contextual first, then recommended_next
    expect(data.followUps[0].source).toBe("contextual")
  })

  it("caps follow-ups at 2 when ≥2 artifacts present", () => {
    const msg = buildCompleteMessage({
      runId: "run-1",
      flowName: "Test",
      summary: "Done",
      findings: [],
      limitations: [],
      artifacts: [
        { name: "a.md", path: "/workspace/a.md", kind: "report" },
        { name: "b.md", path: "/workspace/b.md", kind: "report" },
      ],
      followUps: [
        { label: "A", emoji: "1", source: "contextual" as const },
        { label: "B", emoji: "2", source: "recommended_next" as const },
        { label: "C", emoji: "3", source: "recommended_next" as const },
        { label: "D", emoji: "4", source: "recommended_next" as const },
      ],
      durationMs: 60000,
      costUsd: 0.01,
    })

    const data = msg.content.data as CompleteContent
    expect(data.followUps).toHaveLength(2)
  })

  it("caps artifacts at 3", () => {
    const msg = buildCompleteMessage({
      runId: "run-1",
      flowName: "Test",
      summary: "Done",
      findings: [],
      limitations: [],
      artifacts: Array.from({ length: 8 }, (_, i) => ({
        name: `file-${i}.md`,
        path: `/workspace/file-${i}.md`,
        kind: "report",
      })),
      followUps: [],
      durationMs: 10000,
      costUsd: 0.01,
    })

    const data = msg.content.data as CompleteContent
    expect(data.artifacts).toHaveLength(3)
  })
})

describe("buildErrorMessage", () => {
  it("creates error variant with failed node label and message", () => {
    const msg = buildErrorMessage({
      runId: "run-1",
      flowName: "Deep Research",
      variant: "error",
      errorMessage: "Rate limit exceeded",
      failedNodeLabel: "Gather sources",
    })

    expect(msg.content.type).toBe("error")
    const data = msg.content.data as ErrorContent
    expect(data.variant).toBe("error")
    expect(data.summary).toContain("Gather sources")
    expect(data.summary).toContain("Rate limit exceeded")
    expect(data.suggestions).toHaveLength(2)
    expect(data.actions).toHaveLength(1)
    expect(data.actions[0].label).toBe("Start fresh run")
    expect(data.actions[0].variant).toBe("primary")
    expect(msg.id).toBeTruthy()
  })

  it("creates error variant with retry-from-failed when failedNodeId provided", () => {
    const msg = buildErrorMessage({
      runId: "run-1",
      flowName: "Deep Research",
      variant: "error",
      errorMessage: "Rate limit exceeded",
      failedNodeLabel: "gather-sources",
      failedNodeId: "gather-sources",
    })
    const data = msg.content.data as ErrorContent
    expect(data.actions).toHaveLength(2)
    expect(data.actions[0].label).toBe("Retry from failed step")
    expect(data.actions[0].variant).toBe("primary")
    expect(data.actions[1].label).toBe("Start fresh run")
    expect(data.actions[1].variant).toBe("secondary")
  })

  it("creates error variant without node label", () => {
    const msg = buildErrorMessage({
      runId: "run-1",
      flowName: "Test",
      variant: "error",
      errorMessage: "Network timeout",
    })

    const data = msg.content.data as ErrorContent
    expect(data.summary).toBe("Network timeout")
  })

  it("creates error variant with no details", () => {
    const msg = buildErrorMessage({
      runId: "run-1",
      flowName: "Test",
      variant: "error",
    })

    const data = msg.content.data as ErrorContent
    expect(data.summary).toBe("Flow encountered an error.")
  })

  it("creates cancelled variant", () => {
    const msg = buildErrorMessage({
      runId: "run-1",
      flowName: "Segment Research",
      variant: "cancelled",
    })

    expect(msg.content.type).toBe("error")
    const data = msg.content.data as ErrorContent
    expect(data.variant).toBe("cancelled")
    expect(data.summary).toBe("Flow stopped.")
    expect(data.suggestions).toHaveLength(0)
    expect(data.actions).toHaveLength(1)
    expect(data.actions[0].label).toBe("Start again")
    expect(data.actions[0].variant).toBe("secondary")
  })

  it("creates interrupted variant with continue + start again actions", () => {
    const msg = buildErrorMessage({
      runId: "run-1",
      flowName: "Long Analysis",
      variant: "interrupted",
    })

    expect(msg.content.type).toBe("error")
    const data = msg.content.data as ErrorContent
    expect(data.variant).toBe("interrupted")
    expect(data.summary).toContain("interrupted")
    expect(data.suggestions).toHaveLength(1)
    expect(data.suggestions[0]).toContain("progress was saved")
    expect(data.actions).toHaveLength(2)
    expect(data.actions[0].label).toBe("Continue")
    expect(data.actions[0].variant).toBe("primary")
    expect(data.actions[1].label).toBe("Start again")
    expect(data.actions[1].variant).toBe("secondary")
  })
})

describe("buildStartMessage", () => {
  it("creates a start message with description", () => {
    const msg = buildStartMessage({
      flowName: "Market Analysis",
      description: "I'll scan competitors, collect signals, then synthesize.",
    })

    expect(msg.content.type).toBe("start")
    expect(msg.flowName).toBe("Market Analysis")
    const data = msg.content.data as StartContent
    expect(data.description).toBe(
      "I'll scan competitors, collect signals, then synthesize.",
    )
    expect(msg.id).toBeTruthy()
    expect(msg.timestamp).toBeGreaterThan(0)
  })
})

describe("buildProgressMessage", () => {
  it("creates a progress message with steps", () => {
    const msg = buildProgressMessage({
      flowName: "Deep Research",
      steps: [
        {
          nodeId: "n1",
          label: "Gather sources",
          status: "done",
          summary: "12 sources found",
        },
        { nodeId: "n2", label: "Analyze signals", status: "running" },
        { nodeId: "n3", label: "Synthesize report", status: "pending" },
      ],
    })

    expect(msg.content.type).toBe("progress")
    expect(msg.flowName).toBe("Deep Research")
    const data = msg.content.data as ProgressContent
    expect(data.steps).toHaveLength(3)
    expect(data.steps[0].status).toBe("done")
    expect(data.steps[0].summary).toBe("12 sources found")
    expect(data.steps[1].status).toBe("running")
    expect(data.steps[2].status).toBe("pending")
    expect(msg.id).toBeTruthy()
  })

  it("creates a progress message with sub-steps", () => {
    const msg = buildProgressMessage({
      flowName: "Segment Research",
      steps: [
        {
          nodeId: "splitter-1",
          label: "Research segments",
          status: "running",
          subSteps: [
            { key: "seg-1", label: "B2C market", done: true },
            { key: "seg-2", label: "B2B market", done: false },
          ],
        },
      ],
    })

    const data = msg.content.data as ProgressContent
    expect(data.steps[0].subSteps).toHaveLength(2)
    expect(data.steps[0].subSteps![0].done).toBe(true)
    expect(data.steps[0].subSteps![1].done).toBe(false)
  })
})
