// @vitest-environment jsdom

import { Provider, createStore } from "jotai"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApprovalDialog } from "./ApprovalDialog"
import {
  approvalRequestsAtom,
  workflowExecutionStatesAtom,
} from "@/features/execution"
import { createEmptyWorkflowExecutionState } from "@/lib/workflow-execution"

afterEach(() => {
  Reflect.deleteProperty(window as Window & { api?: unknown }, "api")
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function createWorkflowSnapshot() {
  return {
    version: 1 as const,
    name: "Ship flow",
    description: "",
    defaults: {
      model: "sonnet",
      maxTurns: 40,
      timeout_minutes: 30,
      maxParallel: 4,
    },
    nodes: [
      {
        id: "review-check",
        type: "evaluator" as const,
        position: { x: 0, y: 0 },
        config: {
          criteria: "Check quality before approval.",
          threshold: 7,
          maxRetries: 2,
        },
      },
      {
        id: "approval-1",
        type: "approval" as const,
        position: { x: 240, y: 0 },
        config: {
          message: "Approve ship",
          show_content: true,
          allow_edit: true,
        },
      },
    ],
    edges: [
      {
        id: "edge-1",
        source: "review-check",
        target: "approval-1",
        type: "default" as const,
      },
    ],
  }
}

describe("ApprovalDialog", () => {
  it("keeps technical details and editable payload behind local disclosures", async () => {
    const user = userEvent.setup()
    const store = createStore()

    store.set(approvalRequestsAtom, [
      {
        workflowKey: "/tmp/ship.chain",
        runId: "run-1",
        nodeId: "approval-1",
        content: "Ship the approved changes with the current release notes.",
        message: "Approve ship",
        allowEdit: true,
      },
    ])
    store.set(workflowExecutionStatesAtom, {
      "/tmp/ship.chain": {
        ...createEmptyWorkflowExecutionState(),
        runId: "run-1",
        runOutcome: "blocked",
        workflowName: "Ship flow",
        runWorkflowPath: "/tmp/ship.chain",
        workflowSnapshot: createWorkflowSnapshot(),
        nodeStates: {
          "review-check": {
            status: "waiting_approval",
            attempts: 1,
            log: [],
          },
        },
        evalResults: {
          "review-check": [
            {
              attempt: 1,
              score: 6,
              reason: "Release still needs a human decision before continue.",
              passed: false,
              fix_instructions: "Review the release notes and approval scope.",
              criteria: [
                {
                  id: "release_scope",
                  score: 6,
                },
              ],
            },
          ],
        },
      },
    })

    Object.assign(window, {
      api: {
        approveNode: vi.fn().mockResolvedValue(true),
        rejectNode: vi.fn().mockResolvedValue(true),
      },
    })

    render(
      <Provider store={store}>
        <ApprovalDialog />
      </Provider>,
    )

    expect(screen.getByText("Decision details")).toBeTruthy()
    expect(screen.getByText("What will run")).toBeTruthy()
    expect(screen.getByText("Review and edit input")).toBeTruthy()
    expect(screen.queryByText("Active rules")).toBeNull()
    expect(
      screen.queryByText(
        "Ship the approved changes with the current release notes.",
      ),
    ).toBeNull()
    expect(
      screen.queryByLabelText("Edit step output before continuing"),
    ).toBeNull()

    await user.click(screen.getByText("Decision details"))
    expect(screen.getByText("Active rules")).toBeTruthy()

    await user.click(screen.getByText("What will run"))
    expect(
      screen.getByText(
        "Ship the approved changes with the current release notes.",
      ),
    ).toBeTruthy()

    await user.click(screen.getByText("Review and edit input"))
    expect(
      screen.getByLabelText("Edit step output before continuing"),
    ).toBeTruthy()
  })
})
