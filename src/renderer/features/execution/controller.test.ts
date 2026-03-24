import { describe, expect, it, vi } from "vitest"
import type { ActiveWorkflowRun, RunResult, Workflow } from "@shared/types"
import { createWorkflowExecutionController } from "./controller"
import {
  createEmptyWorkflowExecutionState,
  type WorkflowExecutionState,
} from "@/lib/workflow-execution"

function createWorkflow(): Workflow {
  return {
    version: 1,
    name: "Research flow",
    nodes: [
      {
        id: "input",
        type: "input",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "output",
        type: "output",
        position: { x: 120, y: 0 },
        config: {},
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "input",
        target: "output",
        type: "default",
      },
    ],
  }
}

function createRunResult(): RunResult {
  return {
    runId: "past-run",
    status: "completed",
    workflowName: "Research flow",
    startedAt: 10,
    completedAt: 20,
    reportPath: "/tmp/report.md",
    workspace: "/tmp/workspace",
  }
}

function createApprovalWorkflow(): Workflow {
  return {
    version: 1,
    name: "Approval flow",
    nodes: [
      {
        id: "input",
        type: "input",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "approval-1",
        type: "approval",
        position: { x: 120, y: 0 },
        config: {
          message: "Review copy",
          show_content: true,
          allow_edit: true,
        },
      },
      {
        id: "approval-2",
        type: "approval",
        position: { x: 240, y: 0 },
        config: {
          message: "Review legal",
          show_content: true,
          allow_edit: false,
        },
      },
      {
        id: "output",
        type: "output",
        position: { x: 360, y: 0 },
        config: {},
      },
    ],
    edges: [
      { id: "edge-1", source: "input", target: "approval-1", type: "default" },
      {
        id: "edge-2",
        source: "approval-1",
        target: "approval-2",
        type: "default",
      },
      { id: "edge-3", source: "approval-2", target: "output", type: "default" },
    ],
  }
}

function createHarness() {
  let executionStates: Record<string, WorkflowExecutionState> = {}
  let approvalRequests: Array<{
    workflowKey: string
    runId: string
    nodeId: string
    content: string
    message?: string
    allowEdit: boolean
  }> = []
  let pastRuns: RunResult[] = []

  const deps = {
    commitExecutionState: vi.fn(
      (
        workflowKey: string,
        update:
          | WorkflowExecutionState
          | ((prev: WorkflowExecutionState) => WorkflowExecutionState),
      ) => {
        const previous =
          executionStates[workflowKey] ?? createEmptyWorkflowExecutionState()
        const nextState =
          typeof update === "function" ? update(previous) : update
        executionStates = {
          ...executionStates,
          [workflowKey]: nextState,
        }
      },
    ),
    updateApprovalRequests: vi.fn((update) => {
      approvalRequests =
        typeof update === "function" ? update(approvalRequests) : update
    }),
    setPastRuns: vi.fn((runs: RunResult[]) => {
      pastRuns = runs
    }),
    listRuns: vi.fn().mockResolvedValue([createRunResult()]),
    onRunFailed: vi.fn(),
    onRunFinished: vi.fn(),
    onError: vi.fn(),
  }

  const controller = createWorkflowExecutionController(deps)
  controller.sync({
    workflowExecutionStates: executionStates,
    selectedProject: "/tmp/project",
  })

  return {
    controller,
    deps,
    getApprovalRequests: () => approvalRequests,
    getPastRuns: () => pastRuns,
    getExecutionStates: () => executionStates,
    moveExecutionState: (fromKey: string, toKey: string) => {
      const source = executionStates[fromKey]
      expect(source).toBeDefined()
      const nextStates = {
        ...executionStates,
        [toKey]: source,
      }
      delete nextStates[fromKey]
      executionStates = nextStates
      controller.sync({
        workflowExecutionStates: executionStates,
        selectedProject: "/tmp/project",
      })
    },
  }
}

describe("WorkflowExecutionController", () => {
  it("buffers workflow events until the started run id is attached", () => {
    const { controller } = createHarness()
    const startHandle = controller.beginExecution(
      createWorkflow(),
      "/tmp/research.chain",
      "/tmp/project",
    )!
    const workflowKey = startHandle.workflowKey

    controller.processWorkflowEvent({
      type: "node-start",
      runId: "run-1",
      nodeId: "input",
    })

    expect(controller.getExecutionState(workflowKey).runStatus).toBe("starting")

    controller.finishStartWithRunId("run-1", startHandle)

    expect(controller.getExecutionState(workflowKey).runId).toBe("run-1")
    expect(controller.getExecutionState(workflowKey).runStatus).toBe("running")
    expect(controller.getExecutionState(workflowKey).activeNodeId).toBe("input")
    expect(
      controller.getExecutionState(workflowKey).nodeStates.input.status,
    ).toBe("running")
  })

  it("rejects duplicate beginExecution calls for the same workflow while start is pending", () => {
    const { controller } = createHarness()

    const first = controller.beginExecution(
      createWorkflow(),
      "/tmp/research.chain",
      "/tmp/project",
    )
    const second = controller.beginExecution(
      createWorkflow(),
      "/tmp/research.chain",
      "/tmp/project",
    )

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    expect(controller.getExecutionState("/tmp/research.chain").runStatus).toBe(
      "starting",
    )
  })

  it("clears approvals and refreshes history when a run completes", async () => {
    const { controller, deps, getApprovalRequests, getPastRuns } =
      createHarness()
    const startHandle = controller.beginExecution(
      createWorkflow(),
      "/tmp/research.chain",
      "/tmp/project",
    )!
    const workflowKey = startHandle.workflowKey
    controller.finishStartWithRunId("run-1", startHandle)

    controller.processWorkflowEvent({
      type: "approval-requested",
      runId: "run-1",
      nodeId: "input",
      content: "Need approval",
      message: "Review this output",
      allowEdit: true,
    })

    expect(getApprovalRequests()).toHaveLength(1)

    controller.processWorkflowEvent({
      type: "run-done",
      runId: "run-1",
      status: "completed",
      reportPath: "/tmp/final-report.md",
      workspace: "/tmp/final-workspace",
    })

    await Promise.resolve()

    expect(getApprovalRequests()).toEqual([])
    expect(deps.listRuns).toHaveBeenCalledWith("/tmp/project")
    expect(getPastRuns()).toEqual([createRunResult()])
    expect(controller.getExecutionState(workflowKey).runStatus).toBe("done")
    expect(controller.getExecutionState(workflowKey).runOutcome).toBe(
      "completed",
    )
    expect(controller.getExecutionState(workflowKey).reportPath).toBe(
      "/tmp/final-report.md",
    )
    expect(controller.getExecutionState(workflowKey).workspace).toBe(
      "/tmp/final-workspace",
    )
  })

  it("dedupes approval requests per node and keeps queue order within a run", () => {
    const { controller, getApprovalRequests } = createHarness()
    const workflow = createApprovalWorkflow()
    const startHandle = controller.beginExecution(
      workflow,
      "/tmp/approval.chain",
      "/tmp/project",
    )!
    controller.finishStartWithRunId("run-approval", startHandle)

    controller.processWorkflowEvent({
      type: "approval-requested",
      runId: "run-approval",
      nodeId: "approval-1",
      content: "Draft v1",
      message: "Review copy",
      allowEdit: true,
    })
    controller.processWorkflowEvent({
      type: "approval-requested",
      runId: "run-approval",
      nodeId: "approval-2",
      content: "Legal note",
      message: "Review legal",
      allowEdit: false,
    })
    controller.processWorkflowEvent({
      type: "approval-requested",
      runId: "run-approval",
      nodeId: "approval-1",
      content: "Draft v2",
      message: "Review copy",
      allowEdit: true,
    })

    expect(getApprovalRequests()).toEqual([
      {
        workflowKey: "/tmp/approval.chain",
        runId: "run-approval",
        nodeId: "approval-1",
        content: "Draft v2",
        message: "Review copy",
        allowEdit: true,
      },
      {
        workflowKey: "/tmp/approval.chain",
        runId: "run-approval",
        nodeId: "approval-2",
        content: "Legal note",
        message: "Review legal",
        allowEdit: false,
      },
    ])
  })

  it("rehydrates an active run snapshot for renderer resync", () => {
    const { controller } = createHarness()
    const snapshot: ActiveWorkflowRun = {
      kind: "run",
      runId: "run-active",
      workflowName: "Research flow",
      workflowPath: "/tmp/research.chain",
      projectPath: "/tmp/project",
      workspace: "/tmp/workspace",
      status: "running",
      startedAt: 100,
      updatedAt: 120,
      nodeStates: {
        input: { status: "completed", attempts: 1, log: [] },
        output: { status: "running", attempts: 1, log: [] },
      },
      runtimeNodes: createWorkflow().nodes,
      runtimeEdges: createWorkflow().edges,
      runtimeMeta: {},
    }

    controller.rehydrateActiveRun(snapshot)

    const state = controller.getExecutionState("/tmp/research.chain")
    expect(state.runId).toBe("run-active")
    expect(state.runStatus).toBe("running")
    expect(state.workspace).toBe("/tmp/workspace")
    expect(state.activeNodeId).toBe("output")
    expect(state.nodeStates.output.status).toBe("running")
  })

  it("rebuilds visible approval requests from a paused rehydrated run", () => {
    const { controller, getApprovalRequests } = createHarness()
    const workflow = createApprovalWorkflow()
    const snapshot: ActiveWorkflowRun = {
      kind: "run",
      runId: "run-paused",
      workflowName: workflow.name,
      workflowPath: "/tmp/approval.chain",
      projectPath: "/tmp/project",
      workspace: "/tmp/workspace",
      status: "paused",
      startedAt: 100,
      updatedAt: 120,
      nodeStates: {
        input: { status: "completed", attempts: 1, log: [] },
        "approval-1": { status: "waiting_approval", attempts: 1, log: [] },
      },
      runtimeNodes: workflow.nodes,
      runtimeEdges: workflow.edges,
      runtimeMeta: {},
    }

    controller.rehydrateActiveRun(snapshot)

    expect(getApprovalRequests()).toEqual([
      {
        workflowKey: "/tmp/approval.chain",
        runId: "run-paused",
        nodeId: "approval-1",
        content: "",
        message: "Review copy",
        allowEdit: true,
      },
    ])
    expect(controller.getExecutionState("/tmp/approval.chain").runStatus).toBe(
      "paused",
    )
  })

  it("reconciles active run events after the workflow key changes", () => {
    const { controller, deps, getExecutionStates, moveExecutionState } =
      createHarness()
    const startHandle = controller.beginExecution(
      createWorkflow(),
      "/tmp/original.chain",
      "/tmp/project",
    )!
    const originalKey = startHandle.workflowKey
    controller.finishStartWithRunId("run-1", startHandle)

    const renamedKey = "/tmp/renamed.chain"
    moveExecutionState(originalKey, renamedKey)

    controller.processWorkflowEvent({
      type: "node-start",
      runId: "run-1",
      nodeId: "output",
    })
    controller.processWorkflowEvent({
      type: "node-done",
      runId: "run-1",
      nodeId: "output",
      output: { content: "Final answer", metadata: { source: "output" } },
    })

    expect(controller.getExecutionState(renamedKey).runStatus).toBe("running")
    expect(controller.getExecutionState(renamedKey).activeNodeId).toBe("output")
    expect(
      controller.getExecutionState(renamedKey).nodeStates.output.status,
    ).toBe("completed")
    expect(controller.getExecutionState(renamedKey).finalContent).toBe(
      "Final answer",
    )
    expect(getExecutionStates()[originalKey]).toBeUndefined()
    expect(deps.commitExecutionState).toHaveBeenLastCalledWith(
      renamedKey,
      expect.any(Function),
    )
  })

  it("drops stale run-key mappings until the current run id is registered", () => {
    const { controller } = createHarness()
    const startHandle = controller.beginExecution(
      createWorkflow(),
      "/tmp/original.chain",
      "/tmp/project",
    )!
    const workflowKey = startHandle.workflowKey
    controller.finishStartWithRunId("run-1", startHandle)
    controller.cancelExecution(workflowKey, "run-1")
    ;(
      controller as unknown as {
        runWorkflowKeys: Map<string, string>
        bufferedEvents: Map<string, { events: unknown[] }>
      }
    ).runWorkflowKeys.set("run-1", workflowKey)

    controller.processWorkflowEvent({
      type: "node-start",
      runId: "run-1",
      nodeId: "input",
    })

    const internals = controller as unknown as {
      runWorkflowKeys: Map<string, string>
      bufferedEvents: Map<string, { events: unknown[] }>
    }
    expect(internals.runWorkflowKeys.has("run-1")).toBe(false)
    expect(internals.bufferedEvents.get("run-1")?.events).toHaveLength(1)
  })

  it("caps buffered events per run to avoid unbounded growth", () => {
    const { controller } = createHarness()

    for (let index = 0; index < 550; index += 1) {
      controller.processWorkflowEvent({
        type: "node-start",
        runId: "run-buffered",
        nodeId: `node-${index}`,
      })
    }

    const internals = controller as unknown as {
      bufferedEvents: Map<string, { events: Array<{ nodeId: string }> }>
    }
    const buffered = internals.bufferedEvents.get("run-buffered")
    expect(buffered?.events).toHaveLength(500)
    expect(buffered?.events[0]?.nodeId).toBe("node-50")
    expect(buffered?.events.at(-1)?.nodeId).toBe("node-549")
  })

  it("rejects late start completion after local cancel before run id attachment", () => {
    const { controller } = createHarness()
    const startHandle = controller.beginExecution(
      createWorkflow(),
      "/tmp/research.chain",
      "/tmp/project",
    )!

    controller.cancelExecution(startHandle.workflowKey, null)

    expect(
      controller.getExecutionState(startHandle.workflowKey).runOutcome,
    ).toBe("cancelled")
    expect(controller.finishStartWithRunId("run-late", startHandle)).toEqual({
      accepted: false,
      shouldCancelRun: true,
    })
    expect(
      controller.getExecutionState(startHandle.workflowKey).runStatus,
    ).toBe("done")
    expect(
      controller.getExecutionState(startHandle.workflowKey).runId,
    ).toBeNull()
  })

  it("ignores stale rollback after a start was locally cancelled", () => {
    const { controller } = createHarness()
    const startHandle = controller.beginExecution(
      createWorkflow(),
      "/tmp/research.chain",
      "/tmp/project",
    )!

    controller.cancelExecution(startHandle.workflowKey, null)

    expect(controller.rollbackExecutionStart(startHandle)).toBe(false)
    expect(
      controller.getExecutionState(startHandle.workflowKey).runOutcome,
    ).toBe("cancelled")
  })

  it("does not overwrite a settled state when cancel rollback arrives late", () => {
    const { controller } = createHarness()
    const startHandle = controller.beginExecution(
      createWorkflow(),
      "/tmp/research.chain",
      "/tmp/project",
    )!
    controller.finishStartWithRunId("run-1", startHandle)

    controller.updateExecutionForKey(startHandle.workflowKey, (previous) => ({
      ...previous,
      runStatus: "cancelling",
    }))

    controller.processWorkflowEvent({
      type: "run-done",
      runId: "run-1",
      status: "completed",
      workspace: "/tmp/workspace",
    })

    controller.rollbackCancellation(startHandle.workflowKey, "running", "run-1")

    expect(
      controller.getExecutionState(startHandle.workflowKey).runStatus,
    ).toBe("done")
    expect(
      controller.getExecutionState(startHandle.workflowKey).runOutcome,
    ).toBe("completed")
  })

  it("publishes a durable finished state when cancelling an active run", async () => {
    const { controller, deps } = createHarness()
    const startHandle = controller.beginExecution(
      createWorkflow(),
      "/tmp/research.chain",
      "/tmp/project",
    )!
    controller.finishStartWithRunId("run-1", startHandle)

    controller.cancelExecution(startHandle.workflowKey, "run-1")
    await Promise.resolve()

    expect(controller.getExecutionState(startHandle.workflowKey)).toEqual(
      expect.objectContaining({
        runStatus: "done",
        runOutcome: "cancelled",
        surfaceNotice: expect.objectContaining({
          title: "Run cancelled",
          actionTarget: "activity",
        }),
      }),
    )
    expect(deps.onRunFinished).toHaveBeenCalledWith({
      workflowKey: startHandle.workflowKey,
      state: expect.objectContaining({
        runStatus: "done",
        runOutcome: "cancelled",
      }),
    })
    expect(deps.listRuns).toHaveBeenCalledWith("/tmp/project")
  })

  it("removes approval requests only for the run that finished or cancelled", () => {
    const { controller, getApprovalRequests } = createHarness()
    const firstStart = controller.beginExecution(
      createApprovalWorkflow(),
      "/tmp/approval-a.chain",
      "/tmp/project",
    )!
    const secondStart = controller.beginExecution(
      createApprovalWorkflow(),
      "/tmp/approval-b.chain",
      "/tmp/project",
    )!
    controller.finishStartWithRunId("run-a", firstStart)
    controller.finishStartWithRunId("run-b", secondStart)

    controller.processWorkflowEvent({
      type: "approval-requested",
      runId: "run-a",
      nodeId: "approval-1",
      content: "A",
      message: "Review copy",
      allowEdit: true,
    })
    controller.processWorkflowEvent({
      type: "approval-requested",
      runId: "run-b",
      nodeId: "approval-1",
      content: "B",
      message: "Review copy",
      allowEdit: true,
    })

    controller.cancelExecution(firstStart.workflowKey, "run-a")

    expect(getApprovalRequests()).toEqual([
      {
        workflowKey: "/tmp/approval-b.chain",
        runId: "run-b",
        nodeId: "approval-1",
        content: "B",
        message: "Review copy",
        allowEdit: true,
      },
    ])
  })
})
