import { describe, expect, it } from "vitest"
import { buildRunProgressSummary } from "./run-progress"
import type { Workflow } from "@shared/types"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Impeccable UI Pipeline",
    nodes: [
      {
        id: "input",
        type: "input",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "audit",
        type: "skill",
        position: { x: 120, y: 0 },
        config: {
          skillRef: "audit",
          prompt: "Audit the UI",
        },
      },
      {
        id: "normalize",
        type: "skill",
        position: { x: 240, y: 0 },
        config: {
          skillRef: "normalize",
          prompt: "Normalize the output",
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "input", target: "audit", type: "default" },
      { id: "edge-2", source: "audit", target: "normalize", type: "default" },
    ],
  }
}

describe("buildRunProgressSummary", () => {
  it("marks cancelled runs as stopped instead of completed", () => {
    const summary = buildRunProgressSummary({
      workflow: createWorkflow(),
      runtimeNodes: [],
      runtimeMeta: {},
      nodeStates: {
        audit: { status: "skipped", attempts: 0, log: [] },
        normalize: { status: "pending", attempts: 0, log: [] },
      },
      runStatus: "done",
      runOutcome: "cancelled",
      activeNodeId: null,
    })

    expect(summary.phaseLabel).toBe("Stopped")
    expect(summary.tone).toBe("warning")
  })

  it("uses top-level stage counts and active fan-out progress separately", () => {
    const workflow: Workflow = {
      version: 1,
      name: "Branching audit",
      nodes: [
        {
          id: "input",
          type: "input",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "fanout",
          type: "splitter",
          position: { x: 120, y: 0 },
          config: { maxBranches: 8 },
        },
        {
          id: "audit",
          type: "skill",
          position: { x: 240, y: 0 },
          config: {
            skillRef: "repo-optimise-auditor",
            prompt: "Audit each branch",
          },
        },
        {
          id: "merge",
          type: "merger",
          position: { x: 360, y: 0 },
          config: { strategy: "summarize" },
        },
      ],
      edges: [
        { id: "edge-1", source: "input", target: "fanout", type: "default" },
        { id: "edge-2", source: "fanout", target: "audit", type: "default" },
        { id: "edge-3", source: "audit", target: "merge", type: "default" },
      ],
    }

    const summary = buildRunProgressSummary({
      workflow,
      runtimeNodes: [],
      runtimeMeta: {
        "audit::security": {
          branchIndex: 0,
          totalBranches: 2,
          subtaskKey: "security",
          templateId: "audit",
          splitterId: "fanout",
        },
        "audit::quality": {
          branchIndex: 1,
          totalBranches: 2,
          subtaskKey: "quality",
          templateId: "audit",
          splitterId: "fanout",
        },
      },
      nodeStates: {
        fanout: { status: "completed", attempts: 0, log: [] },
        audit: { status: "pending", attempts: 0, log: [] },
        merge: { status: "pending", attempts: 0, log: [] },
        "audit::security": { status: "completed", attempts: 0, log: [] },
        "audit::quality": { status: "running", attempts: 0, log: [] },
      },
      runStatus: "running",
      runOutcome: null,
      activeNodeId: "audit::quality",
    })

    expect(summary.totalSteps).toBe(3)
    expect(summary.completedSteps).toBe(1)
    expect(summary.activeStepLabel).toBe("Repo Optimise Auditor")
    expect(summary.branchLabel).toBe("1/2 active")
  })
})
