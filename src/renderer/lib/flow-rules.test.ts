import { describe, expect, it } from "vitest"
import {
  deriveExecutionLoopFlowRules,
  deriveExecutionPolicyFlowRules,
} from "./flow-rules"
import { deriveExecutionLoopSummary } from "./execution-loops"
import type { Workflow, WorkflowExecutionPolicyProfile } from "@shared/types"

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

describe("deriveExecutionPolicyFlowRules", () => {
  it("maps policy tags to user-readable flow rules", () => {
    const profile: WorkflowExecutionPolicyProfile = {
      tags: ["human_gate_required", "critique_loops", "publish_gate"],
    }

    expect(
      deriveExecutionPolicyFlowRules(profile, { defaultScope: "Verify" }),
    ).toEqual([
      {
        id: "policy-human_gate_required",
        label: "Ask for approval before this step runs",
        scope: "Verify",
      },
      {
        id: "policy-critique_loops",
        label: "Return to fix when checks fail",
        scope: "Review",
      },
      {
        id: "policy-publish_gate",
        label: "Always ask before shipping",
        scope: "Ship",
      },
    ])
  })

  it("falls back to the policy summary when there are no mapped tags", () => {
    const profile: WorkflowExecutionPolicyProfile = {
      summary: "Run to the next decision with human review.",
    }

    expect(
      deriveExecutionPolicyFlowRules(profile, { defaultScope: "Run" }),
    ).toEqual([
      {
        id: "policy-summary",
        label: "Run to the next decision with human review.",
        scope: "Run",
      },
    ])
  })
})

describe("deriveExecutionLoopFlowRules", () => {
  it("derives loop rules from evaluator summary", () => {
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

    expect(deriveExecutionLoopFlowRules(summary)).toEqual([
      {
        id: "loop-pass",
        label: "Continue automatically when checks pass",
        scope: "Review",
      },
      {
        id: "loop-return",
        label: "Return to fix when checks stay below the threshold",
        scope: "Review",
      },
      {
        id: "loop-escalate",
        label: "Escalate after 3 loop attempts",
        scope: "Review",
      },
      {
        id: "loop-approval",
        label: "Ask for human approval when the loop cannot decide",
        scope: "Review",
      },
    ])
  })
})
