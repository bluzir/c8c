import { describe, expect, it, vi } from "vitest"
import type { Workflow } from "@shared/types"
import {
  buildPendingApprovalNotifications,
  subscribeWorkflowEventBridge,
} from "./useExecutionController"
import { createEmptyWorkflowExecutionState } from "@/lib/workflow-execution"

function createApprovalWorkflow(): Workflow {
  return {
    version: 1,
    name: "Guided dev path",
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
          message: "Review implementation plan",
          show_content: true,
          allow_edit: true,
        },
      },
      {
        id: "output",
        type: "output",
        position: { x: 240, y: 0 },
        config: {},
      },
    ],
    edges: [
      { id: "edge-1", source: "input", target: "approval-1", type: "default" },
      { id: "edge-2", source: "approval-1", target: "output", type: "default" },
    ],
  }
}

describe("buildPendingApprovalNotifications", () => {
  it("maps waiting approvals to inbox task actions", () => {
    const workflow = createApprovalWorkflow()
    const state = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "paused" as const,
      runId: "run-1",
      runWorkflowPath: "/tmp/guided.chain",
      workflowName: "Guided dev path",
      workflowSnapshot: workflow,
      workspace: "/tmp/workspace-1",
      nodeStates: {
        "approval-1": {
          status: "waiting_approval" as const,
          attempts: 1,
          log: [],
          humanTask: {
            taskId: "approval-approval-1",
            status: "open" as const,
          },
        },
      },
    }

    const notifications = buildPendingApprovalNotifications({
      "/tmp/guided.chain": state,
    })

    expect(notifications).toEqual([
      expect.objectContaining({
        title: "Review implementation plan needs approval",
        level: "warning",
        source: "workflow",
        persistentKey: "approval-needed:/tmp/workspace-1::approval-approval-1",
        action: {
          kind: "open_inbox_task",
          taskKey: "/tmp/workspace-1::approval-approval-1",
          workflowPath: "/tmp/guided.chain",
          label: "Open approval",
        },
      }),
    ])
  })

  it("synthesizes a stable approval task key for rehydrated runs without a task pointer", () => {
    const workflow = createApprovalWorkflow()
    const state = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "paused" as const,
      runId: "run-2",
      workflowName: "Guided dev path",
      workflowSnapshot: workflow,
      workspace: "/tmp/workspace-2",
      nodeStates: {
        "approval-1": {
          status: "waiting_approval" as const,
          attempts: 1,
          log: [],
        },
      },
    }

    const notifications = buildPendingApprovalNotifications({
      __draft__: state,
    })

    expect(notifications[0]?.persistentKey).toBe(
      "approval-needed:/tmp/workspace-2::approval-approval-1",
    )
    expect(notifications[0]?.action).toEqual({
      kind: "open_inbox_task",
      taskKey: "/tmp/workspace-2::approval-approval-1",
      workflowPath: undefined,
      label: "Open approval",
    })
  })

  it("ignores completed or non-approval waiting states", () => {
    const workflow = createApprovalWorkflow()
    const pausedState = {
      ...createEmptyWorkflowExecutionState(),
      runStatus: "done" as const,
      runId: "run-3",
      workflowSnapshot: workflow,
      workspace: "/tmp/workspace-3",
      nodeStates: {
        "approval-1": {
          status: "waiting_approval" as const,
          attempts: 1,
          log: [],
          humanTask: {
            taskId: "approval-approval-1",
            status: "answered" as const,
          },
        },
      },
    }

    expect(
      buildPendingApprovalNotifications({ completed: pausedState }),
    ).toEqual([])
  })
})

describe("subscribeWorkflowEventBridge", () => {
  it("forwards subscribed workflow events to the execution controller", () => {
    const processWorkflowEvent = vi.fn()
    const unsubscribe = vi.fn()
    const subscribe = vi.fn(
      (callback: (event: { runId: string; type: string }) => void) => {
        callback({ runId: "run-1", type: "run-done" })
        return unsubscribe
      },
    )

    const returnedUnsubscribe = subscribeWorkflowEventBridge(subscribe, {
      processWorkflowEvent,
    } as { processWorkflowEvent: typeof processWorkflowEvent })

    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(processWorkflowEvent).toHaveBeenCalledWith({
      runId: "run-1",
      type: "run-done",
    })
    expect(returnedUnsubscribe).toBe(unsubscribe)
  })
})
