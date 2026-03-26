import { describe, it, expect } from "vitest"
import { adaptProgressToStepsList } from "./progress-to-steps-adapter"
import type { ProgressContent } from "./flow-chat-types"

describe("adaptProgressToStepsList", () => {
  it("converts basic steps to nodes and nodeStates", () => {
    const data: ProgressContent = {
      steps: [
        {
          nodeId: "a",
          label: "Research",
          status: "done",
          output: "Found 5 sources",
        },
        { nodeId: "b", label: "Write", status: "running" },
        { nodeId: "c", label: "Review", status: "pending" },
      ],
    }

    const result = adaptProgressToStepsList(data)

    expect(result.nodes).toHaveLength(3)
    expect(result.nodes[0].id).toBe("a")
    expect(result.nodes[1].id).toBe("b")
    expect(result.nodes[2].id).toBe("c")

    expect(result.nodeStates["a"].status).toBe("completed")
    expect(result.nodeStates["a"].output?.content).toBe("Found 5 sources")
    expect(result.nodeStates["b"].status).toBe("running")
    expect(result.nodeStates["c"].status).toBe("pending")

    expect(result.activeNodeId).toBe("b")
  })

  it("converts subSteps to child nodes with runtimeMeta", () => {
    const data: ProgressContent = {
      steps: [
        {
          nodeId: "splitter",
          label: "Decompose",
          status: "running",
          subSteps: [
            { key: "branch-0", label: "Claude Code Trends (1/4)", done: true },
            { key: "branch-1", label: "AI Agents (2/4)", done: false },
            { key: "branch-2", label: "MCP Protocol (3/4)", done: false },
          ],
        },
      ],
    }

    const result = adaptProgressToStepsList(data)

    // 1 parent + 3 children
    expect(result.nodes).toHaveLength(4)

    // Children have runtimeMeta with splitterId
    expect(result.runtimeMeta["branch-0"]).toEqual({
      subtaskKey: "branch-0",
      branchIndex: 0,
      totalBranches: 3,
      splitterId: "splitter",
      templateId: "splitter",
    })

    expect(result.runtimeMeta["branch-1"].branchIndex).toBe(1)
    expect(result.runtimeMeta["branch-2"].branchIndex).toBe(2)

    // Done subStep → completed node state
    expect(result.nodeStates["branch-0"].status).toBe("completed")
    expect(result.nodeStates["branch-1"].status).toBe("running")
  })

  it("returns null activeNodeId when no step is running", () => {
    const data: ProgressContent = {
      steps: [
        { nodeId: "a", label: "Done", status: "done" },
        { nodeId: "b", label: "Also done", status: "done" },
      ],
    }

    const result = adaptProgressToStepsList(data)
    expect(result.activeNodeId).toBeNull()
  })

  it("picks first running step as activeNodeId", () => {
    const data: ProgressContent = {
      steps: [
        { nodeId: "a", label: "Running 1", status: "running" },
        { nodeId: "b", label: "Running 2", status: "running" },
      ],
    }

    const result = adaptProgressToStepsList(data)
    expect(result.activeNodeId).toBe("a")
  })

  it("handles empty steps", () => {
    const data: ProgressContent = { steps: [] }
    const result = adaptProgressToStepsList(data)

    expect(result.nodes).toHaveLength(0)
    expect(result.activeNodeId).toBeNull()
    expect(Object.keys(result.nodeStates)).toHaveLength(0)
    expect(Object.keys(result.runtimeMeta)).toHaveLength(0)
  })

  it("maps failed status correctly", () => {
    const data: ProgressContent = {
      steps: [{ nodeId: "x", label: "Broken", status: "failed" }],
    }

    const result = adaptProgressToStepsList(data)
    expect(result.nodeStates["x"].status).toBe("failed")
  })
})
