import { describe, expect, it } from "vitest"
import type { NodeState, Workflow } from "../schema"
import {
  buildRuntimeWorkflowFromSavedState,
  findResumeNodeId,
  type PersistedRunState,
} from "./persisted-run-state"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Audit flow",
    nodes: [
      { id: "input", type: "input", position: { x: 0, y: 0 }, config: {} },
      { id: "audit", type: "skill", position: { x: 100, y: 0 }, config: { prompt: "audit" } },
      { id: "approve", type: "approval", position: { x: 200, y: 0 }, config: { message: "approve" } },
      { id: "output", type: "output", position: { x: 300, y: 0 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "input", target: "audit", type: "default" },
      { id: "e2", source: "audit", target: "approve", type: "default" },
      { id: "e3", source: "approve", target: "output", type: "default" },
    ],
  }
}

function state(status: NodeState["status"]): NodeState {
  return { status, attempts: status === "completed" ? 1 : 0, log: [] }
}

describe("findResumeNodeId", () => {
  it("resumes the first blocked approval node in runtime order", () => {
    const workflow = createWorkflow()
    const savedState: PersistedRunState = {
      runtimeNodes: workflow.nodes,
      nodeStates: {
        input: state("completed"),
        audit: state("completed"),
        approve: state("waiting_approval"),
        output: state("pending"),
      },
    }

    expect(findResumeNodeId(savedState)).toBe("approve")
  })

  it("resumes the first waiting human-input node in runtime order", () => {
    const workflow = createWorkflow()
    const savedState: PersistedRunState = {
      runtimeNodes: workflow.nodes,
      nodeStates: {
        input: state("completed"),
        audit: state("waiting_human"),
        approve: state("pending"),
        output: state("pending"),
      },
    }

    expect(findResumeNodeId(savedState)).toBe("audit")
  })

  it("continues after partial completion from the first unfinished stage", () => {
    const workflow = createWorkflow()
    const savedState: PersistedRunState = {
      runtimeNodes: workflow.nodes,
      nodeStates: {
        input: state("completed"),
        audit: state("completed"),
        approve: state("completed"),
        output: state("queued"),
      },
    }

    expect(findResumeNodeId(savedState)).toBe("output")
  })
})

describe("buildRuntimeWorkflowFromSavedState", () => {
  it("prefers saved runtime graph when a fan-out expansion already exists", () => {
    const workflow = createWorkflow()
    const savedState: PersistedRunState = {
      runtimeNodes: [
        ...workflow.nodes,
        { id: "audit::security", type: "skill", position: { x: 100, y: 80 }, config: { prompt: "security" } },
      ],
      runtimeEdges: [
        ...workflow.edges,
        { id: "branch-edge", source: "audit", target: "audit::security", type: "default" },
      ],
      runtimeMeta: {
        "audit::security": {
          subtaskKey: "security",
          branchIndex: 0,
          totalBranches: 1,
          splitterId: "audit",
          templateId: "audit",
        },
      },
      nodeStates: {},
    }

    const runtimeWorkflow = buildRuntimeWorkflowFromSavedState(workflow, savedState)

    expect(runtimeWorkflow.nodes.map((node) => node.id)).toContain("audit::security")
    expect(runtimeWorkflow.edges.map((edge) => edge.id)).toContain("branch-edge")
    expect(runtimeWorkflow.runtimeMeta["audit::security"]?.subtaskKey).toBe("security")
  })
})
