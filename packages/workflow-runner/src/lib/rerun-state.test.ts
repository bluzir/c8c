import { describe, expect, it } from "vitest"
import type { NodeState, WorkflowEdge } from "../schema"
import { prepareRerunState } from "./rerun-state"

describe("prepareRerunState", () => {
  it("resets only the failed linear tail and keeps upstream completed work", () => {
    const nodeStates: Record<string, NodeState> = {
      input: { status: "completed", attempts: 1, log: [{ type: "text", content: "input ok", timestamp: 1 }] },
      mapper: { status: "completed", attempts: 1, log: [{ type: "text", content: "mapped", timestamp: 2 }] },
      merger: {
        status: "failed",
        attempts: 2,
        log: [{ type: "error", content: "merge failed", timestamp: 3 }],
        error: "merge failed",
      },
      output: { status: "pending", attempts: 0, log: [] },
    }
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "input", target: "mapper", type: "default" },
      { id: "e2", source: "mapper", target: "merger", type: "default" },
      { id: "e3", source: "merger", target: "output", type: "default" },
    ]

    const result = prepareRerunState({
      fromNodeId: "merger",
      nodeStates,
      edges,
    })

    expect(result.nodeStates.input.status).toBe("completed")
    expect(result.nodeStates.mapper.status).toBe("completed")
    expect(result.nodeStates.merger.status).toBe("pending")
    expect(result.nodeStates.output.status).toBe("pending")
    expect(result.activatedEdges).toEqual(new Set(["e1", "e2"]))
  })

  it("preserves completed sibling branches and only resets the failed branch tail", () => {
    const nodeStates: Record<string, NodeState> = {
      input: { status: "completed", attempts: 1, log: [] },
      splitter: { status: "completed", attempts: 1, log: [] },
      "branch-a": { status: "completed", attempts: 1, log: [{ type: "text", content: "done", timestamp: 1 }] },
      "branch-b": {
        status: "failed",
        attempts: 2,
        log: [{ type: "error", content: "merge failed", timestamp: 2 }],
        error: "merge failed",
        meta: { subtaskKey: "branch-b" },
      },
      "branch-c": { status: "completed", attempts: 1, log: [{ type: "text", content: "done", timestamp: 3 }] },
      merger: { status: "pending", attempts: 0, log: [] },
      summary: { status: "pending", attempts: 0, log: [] },
    }
    const edges: WorkflowEdge[] = [
      { id: "e1", source: "input", target: "splitter", type: "default" },
      { id: "e2", source: "splitter", target: "branch-a", type: "default" },
      { id: "e3", source: "splitter", target: "branch-b", type: "default" },
      { id: "e4", source: "splitter", target: "branch-c", type: "default" },
      { id: "e5", source: "branch-a", target: "merger", type: "default" },
      { id: "e6", source: "branch-b", target: "merger", type: "default" },
      { id: "e7", source: "branch-c", target: "merger", type: "default" },
      { id: "e8", source: "merger", target: "summary", type: "default" },
    ]

    const result = prepareRerunState({
      fromNodeId: "branch-b",
      nodeStates,
      edges,
    })

    expect(result.downstreamIds).toEqual(new Set(["branch-b", "merger", "summary"]))
    expect(result.nodeStates["branch-a"].status).toBe("completed")
    expect(result.nodeStates["branch-c"].status).toBe("completed")
    expect(result.nodeStates["branch-b"]).toMatchObject({
      status: "pending",
      attempts: 0,
      meta: { subtaskKey: "branch-b" },
    })
    expect(result.nodeStates["branch-b"].log).toEqual([])
    expect(result.nodeStates.merger.status).toBe("pending")
    expect(result.nodeStates.summary.status).toBe("pending")
    expect(result.activatedEdges).toEqual(new Set(["e1", "e2", "e3", "e4", "e5", "e7"]))
  })
})
