// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  createEmptyWorkflowExecutionState,
  type WorkflowExecutionState,
} from "@/lib/workflow-execution"
import type { DashboardEntry } from "./dashboardModel"
import { MultiRunDashboardDetail } from "./MultiRunDashboardDetail"

function createEntry(overrides: Partial<DashboardEntry> = {}): DashboardEntry {
  const baseState: WorkflowExecutionState = {
    ...createEmptyWorkflowExecutionState(),
    workflowName: "UX/UI Polish Audit",
  }

  return {
    ...baseState,
    workflowKey: "/tmp/ux-ui-polish-audit.chain",
    workflowPath: "/tmp/ux-ui-polish-audit.chain",
    approvalCount: 0,
    approvalMessages: [],
    isSelectedWorkflow: false,
    activeNodeLabel: null,
    progress: {
      totalSteps: 3,
      completedSteps: 3,
      runningSteps: 0,
      waitingApprovalSteps: 0,
      failedSteps: 0,
    },
    pastRun: null,
    ...overrides,
  }
}

describe("MultiRunDashboardDetail", () => {
  it("opens completed entries in review mode", async () => {
    const user = userEvent.setup()
    const onFocusWorkflow = vi.fn().mockResolvedValue(undefined)

    const entry = createEntry({
      runStatus: "done",
      runOutcome: "completed",
      pastRun: {
        runId: "run-123",
        workflowName: "UX/UI Polish Audit",
        workflowPath: "/tmp/ux-ui-polish-audit.chain",
        workspace: "/tmp/run-123",
        startedAt: 10,
        completedAt: 20,
        durationMs: 10,
        status: "completed",
        reportPath: "",
        totalCost: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
      },
    })

    render(
      <MultiRunDashboardDetail
        entry={entry}
        now={30}
        onFocusWorkflow={onFocusWorkflow}
        onPauseExecution={vi.fn()}
        onResumeExecution={vi.fn()}
        onCancelExecution={vi.fn()}
        onClearEntry={vi.fn()}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Review result" }))

    expect(onFocusWorkflow).toHaveBeenCalledWith(entry, {
      reviewPastRun: true,
    })
  })
})
