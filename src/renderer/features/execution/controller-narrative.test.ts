import { describe, it, expect, vi, beforeEach } from "vitest"
import type { WorkflowNode, Workflow, WorkflowRuntimeMeta } from "@shared/types"
import type { StepNarrativeContent, FlowChatMessage } from "@/lib/flow-chat-types"
import {
  seedStepNarratives,
  updateNarrativeForNodeStart,
  updateNarrativeForNodeDone,
  markPendingNarrativesSkipped,
  addBranchesToParentNarrative,
  type StepNarrativeMaps,
} from "./controller-narrative-helpers"

// ── Helpers ──────────────────────────────────────────────

function makeNode(
  id: string,
  type: WorkflowNode["type"],
  label?: string,
): WorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    config: {
      ...(label ? { name: label } : {}),
    },
  } as WorkflowNode
}

function makeWorkflow(nodes: WorkflowNode[]): Workflow {
  return {
    version: 1,
    name: "Test Flow",
    nodes,
    edges: [],
  }
}

function createNarrativeMaps(): StepNarrativeMaps {
  return {
    ids: new Map<string, string>(),
    narratives: new Map<string, StepNarrativeContent>(),
  }
}

// ── Tests ────────────────────────────────────────────────

describe("seedStepNarratives", () => {
  it("produces narratives for trackable nodes, skipping input/output/merger", () => {
    const workflow = makeWorkflow([
      makeNode("input-1", "input"),
      makeNode("skill-1", "skill"),
      makeNode("eval-1", "evaluator"),
      makeNode("split-1", "splitter"),
      makeNode("merger-1", "merger"),
      makeNode("output-1", "output"),
    ])

    const messages: FlowChatMessage[] = []
    const maps = createNarrativeMaps()

    seedStepNarratives({
      workflow,
      workflowKey: "wf-1",
      flowName: "Test Flow",
      activeNodeId: "skill-1",
      maps,
      emitMessage: (msg) => messages.push(msg),
    })

    // Should produce 3 narratives: skill-1, eval-1, split-1
    expect(maps.narratives.size).toBe(3)
    expect(maps.ids.size).toBe(3)
    expect(messages).toHaveLength(3)

    // The active node should be "running"
    const skillNarrative = maps.narratives.get("skill-1")
    expect(skillNarrative).toBeDefined()
    expect(skillNarrative!.status).toBe("running")
    expect(skillNarrative!.startedAt).toBeDefined()

    // Non-active nodes should be "pending"
    const evalNarrative = maps.narratives.get("eval-1")
    expect(evalNarrative).toBeDefined()
    expect(evalNarrative!.status).toBe("pending")

    const splitNarrative = maps.narratives.get("split-1")
    expect(splitNarrative).toBeDefined()
    expect(splitNarrative!.status).toBe("pending")
  })

  it("assigns correct nodeType for each node", () => {
    const workflow = makeWorkflow([
      makeNode("skill-1", "skill"),
      makeNode("eval-1", "evaluator"),
      makeNode("approval-1", "approval"),
    ])

    const maps = createNarrativeMaps()
    seedStepNarratives({
      workflow,
      workflowKey: "wf-1",
      flowName: "Test Flow",
      activeNodeId: "skill-1",
      maps,
      emitMessage: () => {},
    })

    expect(maps.narratives.get("skill-1")!.nodeType).toBe("skill")
    expect(maps.narratives.get("eval-1")!.nodeType).toBe("evaluator")
    expect(maps.narratives.get("approval-1")!.nodeType).toBe("approval")
  })
})

describe("updateNarrativeForNodeStart", () => {
  it("transitions a pending narrative to running", () => {
    const maps = createNarrativeMaps()
    const narrative: StepNarrativeContent = {
      nodeId: "skill-1",
      label: "Research",
      status: "pending",
      nodeType: "skill",
    }
    maps.ids.set("skill-1", "msg-1")
    maps.narratives.set("skill-1", narrative)

    const result = updateNarrativeForNodeStart(maps, "skill-1")

    expect(result).not.toBeNull()
    expect(result!.narrative.status).toBe("running")
    expect(result!.narrative.startedAt).toBeDefined()
    expect(result!.messageId).toBe("msg-1")
  })

  it("returns null for an unknown node", () => {
    const maps = createNarrativeMaps()
    const result = updateNarrativeForNodeStart(maps, "unknown-node")
    expect(result).toBeNull()
  })
})

describe("updateNarrativeForNodeDone", () => {
  it("transitions a running narrative to done with summary and duration", () => {
    const maps = createNarrativeMaps()
    const startedAt = Date.now() - 5000
    const narrative: StepNarrativeContent = {
      nodeId: "skill-1",
      label: "Research",
      status: "running",
      nodeType: "skill",
      startedAt,
    }
    maps.ids.set("skill-1", "msg-1")
    maps.narratives.set("skill-1", narrative)

    const result = updateNarrativeForNodeDone(maps, "skill-1", {
      summary: "Found 3 relevant results.",
      costUsd: 0.05,
    })

    expect(result).not.toBeNull()
    expect(result!.narrative.status).toBe("done")
    expect(result!.narrative.summary).toBe("Found 3 relevant results.")
    expect(result!.narrative.costUsd).toBe(0.05)
    expect(result!.narrative.completedAt).toBeDefined()
    expect(result!.narrative.duration).toBeDefined()
    expect(result!.messageId).toBe("msg-1")
  })

  it("returns null for an unknown node", () => {
    const maps = createNarrativeMaps()
    const result = updateNarrativeForNodeDone(maps, "unknown", {})
    expect(result).toBeNull()
  })
})

describe("markPendingNarrativesSkipped", () => {
  it("marks pending steps as skipped on error run-done", () => {
    const maps = createNarrativeMaps()
    maps.ids.set("skill-1", "msg-1")
    maps.narratives.set("skill-1", {
      nodeId: "skill-1",
      label: "Research",
      status: "done",
      nodeType: "skill",
    })
    maps.ids.set("eval-1", "msg-2")
    maps.narratives.set("eval-1", {
      nodeId: "eval-1",
      label: "Evaluate",
      status: "pending",
      nodeType: "evaluator",
    })
    maps.ids.set("skill-2", "msg-3")
    maps.narratives.set("skill-2", {
      nodeId: "skill-2",
      label: "Write",
      status: "pending",
      nodeType: "skill",
    })

    const skipped = markPendingNarrativesSkipped(maps)

    expect(skipped).toHaveLength(2)
    expect(skipped[0].narrative.status).toBe("skipped")
    expect(skipped[0].narrative.nodeId).toBe("eval-1")
    expect(skipped[1].narrative.status).toBe("skipped")
    expect(skipped[1].narrative.nodeId).toBe("skill-2")

    // The done one should be untouched
    expect(maps.narratives.get("skill-1")!.status).toBe("done")
  })

  it("returns empty array when no pending steps", () => {
    const maps = createNarrativeMaps()
    maps.ids.set("skill-1", "msg-1")
    maps.narratives.set("skill-1", {
      nodeId: "skill-1",
      label: "Research",
      status: "done",
      nodeType: "skill",
    })

    const skipped = markPendingNarrativesSkipped(maps)
    expect(skipped).toHaveLength(0)
  })
})

describe("addBranchesToParentNarrative", () => {
  it("adds branch entries to the parent splitter narrative", () => {
    const maps = createNarrativeMaps()
    maps.ids.set("split-1", "msg-1")
    maps.narratives.set("split-1", {
      nodeId: "split-1",
      label: "Split work",
      status: "running",
      nodeType: "splitter",
    })

    const runtimeMeta: WorkflowRuntimeMeta = {
      "branch-1": {
        splitterId: "split-1",
        subtaskKey: "task-1",
        branchIndex: 0,
        totalBranches: 2,
        templateId: "t1",
      },
      "branch-2": {
        splitterId: "split-1",
        subtaskKey: "task-2",
        branchIndex: 1,
        totalBranches: 2,
        templateId: "t1",
      },
    }

    const result = addBranchesToParentNarrative({
      maps,
      newNodeIds: ["branch-1", "branch-2"],
      runtimeMeta,
      getNodeLabel: (id) => `Branch ${id}`,
    })

    expect(result).not.toBeNull()
    expect(result!.narrative.branches).toHaveLength(2)
    expect(result!.narrative.branches![0].nodeId).toBe("branch-1")
    expect(result!.narrative.branches![0].status).toBe("pending")
    expect(result!.narrative.branches![1].nodeId).toBe("branch-2")
    expect(result!.messageId).toBe("msg-1")
  })

  it("returns null when parent splitter is not found", () => {
    const maps = createNarrativeMaps()
    const runtimeMeta: WorkflowRuntimeMeta = {
      "branch-1": {
        splitterId: "unknown-split",
        subtaskKey: "task-1",
        branchIndex: 0,
        totalBranches: 1,
        templateId: "t1",
      },
    }

    const result = addBranchesToParentNarrative({
      maps,
      newNodeIds: ["branch-1"],
      runtimeMeta,
      getNodeLabel: (id) => id,
    })

    expect(result).toBeNull()
  })
})
