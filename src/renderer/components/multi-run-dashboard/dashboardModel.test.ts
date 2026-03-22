import { describe, expect, it } from "vitest"
import { createEmptyWorkflowExecutionState, type WorkflowExecutionState } from "@/lib/workflow-execution"
import {
  outcomeClasses,
  outcomeLabel,
  primaryActionLabel,
  triageGroup,
  triageHeadline,
  type DashboardEntry,
} from "./dashboardModel"

function createEntry(overrides: Partial<DashboardEntry> = {}): DashboardEntry {
  const baseState: WorkflowExecutionState = {
    ...createEmptyWorkflowExecutionState(),
    workflowName: "CTO Optimise Audit",
  }

  return {
    ...baseState,
    workflowKey: "/tmp/flow.yaml",
    workflowPath: "/tmp/flow.yaml",
    approvalCount: 0,
    approvalMessages: [],
    isSelectedWorkflow: false,
    activeNodeLabel: "System Mapper",
    progress: {
      totalSteps: 3,
      completedSteps: 1,
      runningSteps: 0,
      waitingApprovalSteps: 0,
      failedSteps: 0,
    },
    pastRun: null,
    ...overrides,
  }
}

describe("dashboardModel run display state", () => {
  it("treats running approval waits as needs-action instead of generic running", () => {
    const entry = createEntry({
      runStatus: "running",
      approvalCount: 2,
    })

    expect(outcomeLabel(entry)).toBe("Waiting for approval")
    expect(outcomeClasses(entry)).toBe("ui-status-badge-warning")
    expect(triageGroup(entry)).toBe("needs_action")
    expect(triageHeadline(entry)).toBe("2 approvals waiting")
    expect(primaryActionLabel(entry)).toBe("Review decision")
  })

  it("keeps terminal blocked runs readable even when approval count is not rehydrated", () => {
    const entry = createEntry({
      runStatus: "done",
      runOutcome: "blocked",
      approvalCount: 0,
    })

    expect(outcomeLabel(entry)).toBe("Needs approval")
    expect(triageGroup(entry)).toBe("needs_action")
    expect(triageHeadline(entry)).toBe("Needs approval")
  })

  it("does not let stale lastError override an explicit completed outcome", () => {
    const entry = createEntry({
      runStatus: "done",
      runOutcome: "completed",
      lastError: "old failure",
    })

    expect(outcomeLabel(entry)).toBe("Completed")
    expect(outcomeClasses(entry)).toBe("ui-status-badge-success")
    expect(triageGroup(entry)).toBe("recent")
    expect(primaryActionLabel(entry)).toBe("Review result")
  })
})
