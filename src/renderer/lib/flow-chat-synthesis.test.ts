import { describe, it, expect } from "vitest"
import {
  buildProgressStepsFromSnapshot,
  synthesizeTimelineFromRun,
} from "./flow-chat-synthesis"
import type {
  WorkflowNode,
  NodeState,
  PersistedRunSnapshot,
  RunResult,
  WorkflowRuntimeMeta,
} from "@shared/types"
import type { ProgressContent, CompleteContent, ErrorContent, StartContent } from "./flow-chat-types"

function makeSkillNode(id: string, skillRef: string): WorkflowNode {
  return {
    id,
    type: "skill",
    position: { x: 0, y: 0 },
    config: { skillRef, prompt: "" },
  } as unknown as WorkflowNode
}

function makeInputNode(id: string): WorkflowNode {
  return {
    id,
    type: "input",
    position: { x: 0, y: 0 },
    config: {},
  } as unknown as WorkflowNode
}

function makeOutputNode(id: string): WorkflowNode {
  return {
    id,
    type: "output",
    position: { x: 0, y: 0 },
    config: { title: "Result" },
  } as unknown as WorkflowNode
}

function makeSplitterNode(id: string): WorkflowNode {
  return {
    id,
    type: "splitter",
    position: { x: 0, y: 0 },
    config: {},
  } as unknown as WorkflowNode
}

describe("buildProgressStepsFromSnapshot", () => {
  it("builds steps from nodes and nodeStates, skipping input/output/merger", () => {
    const nodes = [
      makeInputNode("in"),
      makeSkillNode("research", "deep-research/researcher"),
      makeSkillNode("write", "writer"),
      makeOutputNode("out"),
    ]
    const nodeStates: Record<string, NodeState> = {
      in: { status: "completed", attempts: 1, log: [] },
      research: { status: "completed", attempts: 1, log: [] },
      write: { status: "running", attempts: 1, log: [] },
      out: { status: "pending", attempts: 0, log: [] },
    }

    const result = buildProgressStepsFromSnapshot({ nodes, nodeStates })

    expect(result.steps).toHaveLength(2)
    expect(result.steps[0].nodeId).toBe("research")
    expect(result.steps[0].status).toBe("done")
    expect(result.steps[1].nodeId).toBe("write")
    expect(result.steps[1].status).toBe("running")
    expect(result.description).toContain("I'll")
  })

  it("marks activeNodeId as running even if nodeStates says pending", () => {
    const nodes = [
      makeSkillNode("a", "scout"),
      makeSkillNode("b", "writer"),
    ]
    const nodeStates: Record<string, NodeState> = {
      a: { status: "pending", attempts: 0, log: [] },
      b: { status: "pending", attempts: 0, log: [] },
    }

    const result = buildProgressStepsFromSnapshot({
      nodes,
      nodeStates,
      activeNodeId: "a",
    })

    expect(result.steps[0].status).toBe("running")
    expect(result.steps[1].status).toBe("pending")
  })

  it("nests splitter branch children as subSteps", () => {
    const nodes = [
      makeSplitterNode("split"),
      makeSkillNode("branch-0", "worker"),
      makeSkillNode("branch-1", "worker"),
    ]
    const nodeStates: Record<string, NodeState> = {
      split: { status: "completed", attempts: 1, log: [] },
      "branch-0": { status: "completed", attempts: 1, log: [] },
      "branch-1": { status: "running", attempts: 1, log: [] },
    }
    const runtimeMeta: WorkflowRuntimeMeta = {
      "branch-0": { splitterId: "split", subtaskKey: "b0", branchIndex: 0, totalBranches: 2, templateId: "split" },
      "branch-1": { splitterId: "split", subtaskKey: "b1", branchIndex: 1, totalBranches: 2, templateId: "split" },
    }

    const result = buildProgressStepsFromSnapshot({
      nodes,
      nodeStates,
      runtimeMeta,
    })

    expect(result.steps).toHaveLength(1) // only the splitter parent
    expect(result.steps[0].nodeId).toBe("split")
    expect(result.steps[0].subSteps).toHaveLength(2)
    expect(result.steps[0].subSteps![0].done).toBe(true)
    expect(result.steps[0].subSteps![1].status).toBe("running")
  })

  it("returns empty steps for nodes with no trackable types", () => {
    const nodes = [makeInputNode("in"), makeOutputNode("out")]
    const nodeStates: Record<string, NodeState> = {
      in: { status: "completed", attempts: 1, log: [] },
      out: { status: "completed", attempts: 1, log: [] },
    }

    const result = buildProgressStepsFromSnapshot({ nodes, nodeStates })

    expect(result.steps).toHaveLength(0)
    expect(result.description).toBe("")
  })

  it("builds description with 'and N more' for >4 nodes", () => {
    const nodes = Array.from({ length: 6 }, (_, i) =>
      makeSkillNode(`s${i}`, `skill-${i}`),
    )
    const nodeStates: Record<string, NodeState> = {}
    for (const n of nodes) {
      nodeStates[n.id] = { status: "pending", attempts: 0, log: [] }
    }

    const result = buildProgressStepsFromSnapshot({ nodes, nodeStates })

    expect(result.description).toContain("and 3 more steps")
  })
})

describe("synthesizeTimelineFromRun", () => {
  const baseRunResult: RunResult = {
    runId: "run-123",
    status: "completed",
    workflowName: "Deep Research",
    startedAt: 1000000,
    completedAt: 1060000,
    reportPath: "/workspace/report.md",
    workspace: "/tmp/workspace",
    durationMs: 60000,
    totalCost: 0.05,
  }

  const baseSnapshot: PersistedRunSnapshot = {
    nodeStates: {
      research: { status: "completed", attempts: 1, log: [] },
      write: { status: "completed", attempts: 1, log: [] },
    },
    runtimeNodes: [
      makeInputNode("in"),
      makeSkillNode("research", "researcher"),
      makeSkillNode("write", "writer"),
      makeOutputNode("out"),
    ],
  }

  it("produces start + collapsed progress + complete for a successful run", () => {
    const messages = synthesizeTimelineFromRun({
      snapshot: baseSnapshot,
      runResult: baseRunResult,
      flowName: "Deep Research",
    })

    expect(messages).toHaveLength(3)

    // Start
    expect(messages[0].content.type).toBe("start")
    expect((messages[0].content.data as StartContent).description).toContain("I'll")
    expect(messages[0].timestamp).toBe(1000000)

    // Progress — collapsed
    expect(messages[1].content.type).toBe("progress")
    const progressData = messages[1].content.data as ProgressContent
    expect(progressData.collapsed).toBe(true)
    expect(progressData.collapsedLabel).toContain("2 steps completed")
    expect(progressData.steps).toHaveLength(2)

    // Complete
    expect(messages[2].content.type).toBe("complete")
    const completeData = messages[2].content.data as CompleteContent
    expect(completeData.metrics.duration).toBe("1 min")
    expect(completeData.metrics.cost).toBe("$0.05")
    expect(completeData.artifacts).toHaveLength(1)
    expect(messages[2].timestamp).toBe(1060000)
  })

  it("produces error message for failed runs", () => {
    const failedResult: RunResult = {
      ...baseRunResult,
      status: "failed",
      failedNodeId: "research",
    }

    const messages = synthesizeTimelineFromRun({
      snapshot: baseSnapshot,
      runResult: failedResult,
      flowName: "Deep Research",
    })

    expect(messages).toHaveLength(3)
    expect(messages[2].content.type).toBe("error")
    const errorData = messages[2].content.data as ErrorContent
    expect(errorData.variant).toBe("error")
    expect(errorData.actions.some((a) => a.label === "Retry from failed step")).toBe(true)
  })

  it("produces cancelled error message for cancelled runs", () => {
    const cancelledResult: RunResult = {
      ...baseRunResult,
      status: "cancelled",
    }

    const messages = synthesizeTimelineFromRun({
      snapshot: baseSnapshot,
      runResult: cancelledResult,
      flowName: "Test Flow",
    })

    expect(messages).toHaveLength(3)
    expect(messages[2].content.type).toBe("error")
    const errorData = messages[2].content.data as ErrorContent
    expect(errorData.variant).toBe("cancelled")
  })

  it("handles snapshot with no trackable nodes", () => {
    const emptySnapshot: PersistedRunSnapshot = {
      nodeStates: {},
      runtimeNodes: [makeInputNode("in"), makeOutputNode("out")],
    }

    const messages = synthesizeTimelineFromRun({
      snapshot: emptySnapshot,
      runResult: baseRunResult,
      flowName: "Simple",
    })

    // Just the terminal message, no start/progress
    expect(messages).toHaveLength(1)
    expect(messages[0].content.type).toBe("complete")
  })

  it("shows partial completion label when not all steps are done", () => {
    const partialSnapshot: PersistedRunSnapshot = {
      nodeStates: {
        research: { status: "completed", attempts: 1, log: [] },
        write: { status: "failed", attempts: 1, log: [] },
      },
      runtimeNodes: [
        makeSkillNode("research", "researcher"),
        makeSkillNode("write", "writer"),
      ],
    }

    const messages = synthesizeTimelineFromRun({
      snapshot: partialSnapshot,
      runResult: { ...baseRunResult, status: "failed", failedNodeId: "write" },
      flowName: "Test",
    })

    const progressData = messages[1].content.data as ProgressContent
    expect(progressData.collapsedLabel).toContain("1/2 steps completed")
  })
})
