import { describe, expect, it } from "vitest"
import type { NodeState, Workflow } from "../schema"
import {
  prepareResumeExecution,
  resolveResumeNodeIdOrThrow,
} from "./run-resume"
import type { PersistedRunState } from "./persisted-run-state"

function state(status: NodeState["status"]): NodeState {
  return { status, attempts: status === "completed" ? 1 : 0, log: [] }
}

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Audit flow",
    nodes: [
      { id: "input", type: "input", position: { x: 0, y: 0 }, config: {} },
      {
        id: "splitter",
        type: "splitter",
        position: { x: 100, y: 0 },
        config: { maxBranches: 8 },
      },
      {
        id: "audit",
        type: "skill",
        position: { x: 200, y: 0 },
        config: { prompt: "audit" },
      },
      {
        id: "merge",
        type: "merger",
        position: { x: 300, y: 0 },
        config: { strategy: "summarize" },
      },
    ],
    edges: [
      { id: "e1", source: "input", target: "splitter", type: "default" },
      { id: "e2", source: "splitter", target: "audit", type: "default" },
      { id: "e3", source: "audit", target: "merge", type: "default" },
    ],
  }
}

describe("run-resume", () => {
  it("selects the first unfinished node when resuming", () => {
    const savedState: PersistedRunState = {
      nodeStates: {
        input: state("completed"),
        splitter: state("completed"),
        audit: state("waiting_human"),
        merge: state("pending"),
      },
    }

    expect(resolveResumeNodeIdOrThrow(savedState)).toBe("audit")
  })

  it("throws when there is no resumable node", () => {
    const savedState: PersistedRunState = {
      nodeStates: {
        input: state("completed"),
        splitter: state("completed"),
      },
    }

    expect(() => resolveResumeNodeIdOrThrow(savedState)).toThrow(
      "Cannot continue: no unfinished nodes found in run state",
    )
  })

  it("prepares fan-out resume without resetting completed sibling branches", () => {
    const workflow = createWorkflow()
    const savedState: PersistedRunState = {
      runtimeNodes: [
        ...workflow.nodes,
        {
          id: "audit::security",
          type: "skill",
          position: { x: 200, y: 80 },
          config: { prompt: "security" },
        },
        {
          id: "audit::quality",
          type: "skill",
          position: { x: 200, y: 120 },
          config: { prompt: "quality" },
        },
      ],
      runtimeEdges: [
        ...workflow.edges,
        {
          id: "b1",
          source: "splitter",
          target: "audit::security",
          type: "default",
        },
        {
          id: "b2",
          source: "splitter",
          target: "audit::quality",
          type: "default",
        },
        {
          id: "b3",
          source: "audit::security",
          target: "merge",
          type: "default",
        },
        {
          id: "b4",
          source: "audit::quality",
          target: "merge",
          type: "default",
        },
      ],
      runtimeMeta: {
        "audit::security": {
          subtaskKey: "security",
          branchIndex: 0,
          totalBranches: 2,
          templateId: "audit",
          splitterId: "splitter",
        },
        "audit::quality": {
          subtaskKey: "quality",
          branchIndex: 1,
          totalBranches: 2,
          templateId: "audit",
          splitterId: "splitter",
        },
      },
      input: { type: "text", value: "Audit this repo" },
      nodeStates: {
        input: state("completed"),
        splitter: state("completed"),
        audit: state("pending"),
        merge: state("pending"),
        "audit::security": state("completed"),
        "audit::quality": {
          status: "failed",
          attempts: 1,
          log: [],
          error: "quality failed",
        },
      },
    }

    const prepared = prepareResumeExecution({
      workflow,
      savedState,
      fromNodeId: "audit::quality",
    })

    expect(prepared.persistedInput).toEqual({
      type: "text",
      value: "Audit this repo",
    })
    expect(prepared.runtimeWorkflow.nodes.map((node) => node.id)).toContain(
      "audit::security",
    )
    expect(prepared.nodeStates["audit::security"].status).toBe("completed")
    expect(prepared.nodeStates["audit::quality"].status).toBe("pending")
    expect(prepared.nodeStates.merge.status).toBe("pending")
  })
})
