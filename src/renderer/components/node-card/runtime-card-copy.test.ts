import { describe, expect, it, vi } from "vitest"

import type { NodeState, WorkflowNode } from "@shared/types"

import {
  buildRuntimeCardCopy,
  getPreviewStatusLabel,
} from "./runtime-card-copy"

function createNode(node: WorkflowNode): WorkflowNode {
  return node
}

function createState(state: Partial<NodeState>): NodeState {
  return {
    status: "pending",
    attempts: 0,
    log: [],
    ...state,
  }
}

describe("runtime-card-copy", () => {
  it("uses step language for completed skill nodes", () => {
    const copy = buildRuntimeCardCopy({
      node: createNode({
        id: "skill-1",
        type: "skill",
        position: { x: 0, y: 0 },
        config: {
          prompt:
            "Implement the requested feature and return the updated code.",
        },
      }),
      state: createState({
        status: "completed",
        output: {
          content: "Feature shipped.",
          metadata: {
            source: "test",
          },
        },
      }),
      retryLabel: null,
      runtimeFocusKind: null,
      runtimeBranchSummary: null,
    })

    expect(copy.summary).toBe("Step complete")
  })

  it("uses approval language for queued and failed approval nodes", () => {
    const approvalNode = createNode({
      id: "approval-1",
      type: "approval",
      position: { x: 0, y: 0 },
      config: {
        message: "Review the generated changes before continuing.",
        show_content: true,
        allow_edit: false,
      },
    })

    const queuedCopy = buildRuntimeCardCopy({
      node: approvalNode,
      state: createState({
        status: "pending",
      }),
      retryLabel: null,
      runtimeFocusKind: "next",
      runtimeBranchSummary: null,
    })

    const failedCopy = buildRuntimeCardCopy({
      node: approvalNode,
      state: createState({
        status: "failed",
        error: "Timed out while waiting for approval",
      }),
      retryLabel: null,
      runtimeFocusKind: null,
      runtimeBranchSummary: null,
    })

    expect(queuedCopy.summary).toBe("Next approval")
    expect(failedCopy.summary).toBe("Approval issue")
  })

  it("summarizes blocked branch work and labels approval previews canonically", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2025-01-01T00:00:10Z"))

    try {
      const copy = buildRuntimeCardCopy({
        node: createNode({
          id: "skill-branches",
          type: "skill",
          position: { x: 0, y: 0 },
          config: {
            prompt: "Fan out implementation tasks.",
          },
        }),
        state: createState({
          status: "running",
          startedAt: Date.now() - 1_000,
        }),
        retryLabel: null,
        runtimeFocusKind: null,
        runtimeBranchSummary: {
          total: 3,
          running: 1,
          completed: 1,
          failed: 0,
          waitingApproval: 1,
          pending: 0,
          previews: [],
        },
      })

      expect(copy.metricChips.some((chip) => chip.includes("1 blocked"))).toBe(
        true,
      )
      expect(getPreviewStatusLabel("waiting_approval")).toBe("Approval")
    } finally {
      vi.useRealTimers()
    }
  })
})
