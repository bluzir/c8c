import { describe, expect, it } from "vitest"
import type { Workflow } from "@shared/types"
import {
  deriveExecutionCheckRecord,
  deriveExecutionLoopSummary,
} from "./execution-loops"

const BASE_WORKFLOW: Workflow = {
  version: 1,
  name: "Review Phase",
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 100, y: 0 },
      config: { prompt: "Review code" },
    },
    {
      id: "eval-1",
      type: "evaluator",
      position: { x: 200, y: 0 },
      config: {
        criteria: "Quality",
        threshold: 8,
        maxRetries: 3,
        retryFrom: "skill-1",
      },
    },
    { id: "output-1", type: "output", position: { x: 300, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "eval-1", type: "default" },
    { id: "e3", source: "eval-1", target: "output-1", type: "pass" },
    { id: "e4", source: "eval-1", target: "skill-1", type: "fail" },
  ],
}

describe("deriveExecutionLoopSummary", () => {
  it("builds auto-pass summary from evaluator results", () => {
    const summary = deriveExecutionLoopSummary({
      workflow: BASE_WORKFLOW,
      nodeStates: {
        "eval-1": {
          status: "completed",
          attempts: 2,
          log: [],
          completedAt: 20,
        },
      },
      evalResults: {
        "eval-1": [
          { attempt: 1, score: 6, reason: "Needs fixes", passed: false },
          { attempt: 2, score: 9, reason: "Looks good", passed: true },
        ],
      },
      runOutcome: "completed",
    })

    expect(summary).toMatchObject({
      loopType: "review",
      loopLabel: "Review loop",
      outcome: "auto-pass",
      outcomeLabel: "Auto-pass",
      attempt: 2,
      maxAttempts: 3,
      score: 9,
      threshold: 8,
      deltaLabel: "6/10 -> 9/10",
    })
  })

  it("builds auto-return summary while retry is in progress", () => {
    const summary = deriveExecutionLoopSummary({
      workflow: BASE_WORKFLOW,
      nodeStates: {
        "eval-1": {
          status: "pending",
          attempts: 1,
          log: [],
          completedAt: 20,
        },
      },
      evalResults: {
        "eval-1": [
          {
            attempt: 1,
            score: 5,
            reason: "Critical issue remains",
            passed: false,
          },
        ],
      },
      runOutcome: "running",
    })

    expect(summary).toMatchObject({
      loopType: "review",
      outcome: "auto-return",
      outcomeLabel: "Auto-return",
      attempt: 1,
      maxAttempts: 3,
      score: 5,
    })
  })

  it("builds human-decision summary when the run is blocked", () => {
    const summary = deriveExecutionLoopSummary({
      workflow: BASE_WORKFLOW,
      nodeStates: {
        "eval-1": {
          status: "completed",
          attempts: 3,
          log: [],
        },
        "approval-1": {
          status: "waiting_approval",
          attempts: 0,
          log: [],
        },
      },
      evalResults: {
        "eval-1": [
          { attempt: 1, score: 7, reason: "Still risky", passed: false },
          { attempt: 2, score: 7, reason: "Still risky", passed: false },
          { attempt: 3, score: 7, reason: "Still risky", passed: false },
        ],
      },
      runOutcome: "blocked",
    })

    expect(summary).toMatchObject({
      loopType: "review",
      outcome: "human decision",
      outcomeLabel: "Human decision",
      attempt: 3,
      maxAttempts: 3,
      score: 7,
    })
  })

  it("maps auto-pass summaries to check records", () => {
    const summary = deriveExecutionLoopSummary({
      workflow: BASE_WORKFLOW,
      nodeStates: {
        "eval-1": {
          status: "completed",
          attempts: 2,
          log: [],
        },
      },
      evalResults: {
        "eval-1": [
          { attempt: 1, score: 6, reason: "Needs fixes", passed: false },
          { attempt: 2, score: 9, reason: "Looks good", passed: true },
        ],
      },
      runOutcome: "completed",
    })

    expect(deriveExecutionCheckRecord(summary)).toMatchObject({
      kind: "check",
      status: "passed",
      statusLabel: "Passed",
    })
  })

  it("does not map human decisions to check records", () => {
    const summary = deriveExecutionLoopSummary({
      workflow: BASE_WORKFLOW,
      nodeStates: {
        "eval-1": {
          status: "completed",
          attempts: 3,
          log: [],
        },
        "approval-1": {
          status: "waiting_approval",
          attempts: 0,
          log: [],
        },
      },
      evalResults: {
        "eval-1": [
          { attempt: 1, score: 7, reason: "Still risky", passed: false },
          { attempt: 2, score: 7, reason: "Still risky", passed: false },
          { attempt: 3, score: 7, reason: "Still risky", passed: false },
        ],
      },
      runOutcome: "blocked",
    })

    expect(deriveExecutionCheckRecord(summary)).toBeNull()
  })
})
