import { describe, expect, it } from "vitest"
import type { NodeInput, NodeState, WorkflowEvent } from "../schema"
import {
  applyNodeLifecycleEffect,
  createInitialRunLifecycleState,
  deriveRunStatus,
  runExecutionLoop,
  skipUnfinishedNodes,
} from "./run-lifecycle"
import type { RuntimeWorkflow } from "./runtime-graph"

function state(status: NodeState["status"], overrides: Partial<NodeState> = {}): NodeState {
  return {
    status,
    attempts: status === "completed" ? 1 : 0,
    log: [],
    ...overrides,
  }
}

function createRuntimeWorkflow(): RuntimeWorkflow {
  return {
    version: 1,
    name: "Test flow",
    nodes: [
      { id: "input", type: "input", position: { x: 0, y: 0 }, config: {} },
      { id: "approve", type: "approval", position: { x: 100, y: 0 }, config: { message: "approve" } },
      { id: "report", type: "output", position: { x: 200, y: 0 }, config: {} },
    ],
    edges: [
      { id: "e1", source: "input", target: "approve", type: "default" },
      { id: "e2", source: "approve", target: "report", type: "default" },
    ],
    runtimeMeta: {},
  }
}

describe("run-lifecycle", () => {
  it("merges lifecycle effects without losing blocking metadata", () => {
    const lifecycle = createInitialRunLifecycleState()

    applyNodeLifecycleEffect(lifecycle, {
      blockedForHuman: true,
      blockedByTaskId: "task-1",
      blockedByNodeId: "approve",
    })
    applyNodeLifecycleEffect(lifecycle, { approvalRejected: true })

    expect(lifecycle).toEqual({
      suspendedForApproval: false,
      blockedForHuman: true,
      approvalRejected: true,
      blockedByTaskId: "task-1",
      blockedByNodeId: "approve",
    })
  })

  it("stops the execution loop once a blocking effect is returned and no nodes remain running", async () => {
    const runtimeWorkflow = createRuntimeWorkflow()
    const nodeStates = {
      input: state("completed"),
      approve: state("pending"),
      report: state("pending"),
    }
    const events: WorkflowEvent[] = []

    const lifecycle = await runExecutionLoop({
      runId: "run-1",
      controller: new AbortController(),
      nodeStates,
      runtimeWorkflow,
      activatedEdges: new Set(["e1"]),
      maxParallel: 4,
      stallTimeoutMs: 10_000,
      waitIfPaused: async () => {},
      processNode: async (nodeId) => {
        if (nodeId === "approve") {
          nodeStates.approve.status = "waiting_approval"
          return {
            suspendedForApproval: true,
            blockedByNodeId: "approve",
          }
        }
      },
      emitEvent: async (event) => {
        events.push(event)
      },
      buildSkippedOutput: (nodeId): NodeInput => ({ content: "", metadata: { source: nodeId, skipped: true } }),
      describeStalledNode: (nodeId) => `Node ${nodeId}`,
    })

    expect(lifecycle.suspendedForApproval).toBe(true)
    expect(lifecycle.blockedByNodeId).toBe("approve")
    expect(events).toEqual([
      { type: "node-queued", runId: "run-1", nodeId: "approve" },
    ])
  })

  it("skips unfinished nodes through one helper instead of per-callsite logic", async () => {
    const runtimeWorkflow = createRuntimeWorkflow()
    const nodeStates = {
      input: state("completed"),
      approve: state("waiting_approval"),
      report: state("pending"),
    }
    const events: WorkflowEvent[] = []

    await skipUnfinishedNodes(
      "run-1",
      nodeStates,
      runtimeWorkflow,
      async (event) => {
        events.push(event)
      },
      (nodeId) => ({ content: "", metadata: { source: nodeId, skipped: true } }),
    )

    expect(nodeStates.approve.status).toBe("skipped")
    expect(nodeStates.report.status).toBe("skipped")
    expect(events).toHaveLength(2)
  })

  it("derives paused, blocked, cancelled, completed, and failed statuses from one contract", () => {
    const runtimeWorkflow = createRuntimeWorkflow()

    expect(deriveRunStatus(
      { input: state("completed"), approve: state("waiting_approval"), report: state("pending") },
      runtimeWorkflow,
      { suspendedForApproval: true, blockedForHuman: false, approvalRejected: false },
      false,
    )).toBe("paused")

    expect(deriveRunStatus(
      { input: state("completed"), approve: state("waiting_human"), report: state("pending") },
      runtimeWorkflow,
      { suspendedForApproval: false, blockedForHuman: true, approvalRejected: false },
      false,
    )).toBe("blocked")

    expect(deriveRunStatus(
      { input: state("completed"), approve: state("failed"), report: state("pending") },
      runtimeWorkflow,
      { suspendedForApproval: false, blockedForHuman: false, approvalRejected: true },
      false,
    )).toBe("cancelled")

    expect(deriveRunStatus(
      { input: state("completed"), approve: state("completed"), report: state("completed") },
      runtimeWorkflow,
      createInitialRunLifecycleState(),
      false,
    )).toBe("completed")

    expect(deriveRunStatus(
      { input: state("completed"), approve: state("failed"), report: state("pending") },
      runtimeWorkflow,
      createInitialRunLifecycleState(),
      false,
    )).toBe("failed")
  })

  it("ignores failed runtime clone branches when deciding overall run completion", () => {
    const runtimeWorkflow: RuntimeWorkflow = {
      ...createRuntimeWorkflow(),
      runtimeMeta: {
        "approve::branch-1": {
          subtaskKey: "branch-1",
          branchIndex: 0,
          totalBranches: 1,
          splitterId: "approve",
          templateId: "approve",
        },
      },
    }

    expect(deriveRunStatus(
      {
        input: state("completed"),
        approve: state("completed"),
        report: state("completed"),
        "approve::branch-1": state("failed"),
      },
      runtimeWorkflow,
      createInitialRunLifecycleState(),
      false,
    )).toBe("completed")
  })
})
