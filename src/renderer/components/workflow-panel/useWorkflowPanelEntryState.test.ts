import { describe, expect, it } from "vitest"
import type { WorkflowEntryState } from "@/lib/workflow-entry"
import {
  hasWorkflowReviewHistory,
  resolveActiveWorkflowEntryState,
} from "./useWorkflowPanelEntryState"

function createEntryState(
  overrides: Partial<WorkflowEntryState> = {},
): WorkflowEntryState {
  return {
    workflowPath: null,
    workflowName: "Draft flow",
    source: "generated",
    title: "Draft flow",
    summary: "Summary",
    contractLabel: "Request",
    contractText: "Request text.",
    inputText: "Input text.",
    outputText: "Output text.",
    readinessText: "Ready to run.",
    ...overrides,
  }
}

describe("resolveActiveWorkflowEntryState", () => {
  it("matches path-bound entry state for the selected workflow", () => {
    const entryState = createEntryState({
      workflowPath: "/tmp/project/flow.chain",
      workflowName: "Saved flow",
    })

    expect(
      resolveActiveWorkflowEntryState({
        workflowEntryState: entryState,
        selectedWorkflowPath: "/tmp/project/flow.chain",
        workflowName: "Saved flow",
      }),
    ).toEqual(entryState)
  })

  it("matches draft entry state only for an unsaved workflow", () => {
    const entryState = createEntryState()

    expect(
      resolveActiveWorkflowEntryState({
        workflowEntryState: entryState,
        selectedWorkflowPath: null,
        workflowName: "Draft flow",
      }),
    ).toEqual(entryState)
  })

  it("does not leak a draft entry state into a saved workflow with the same name", () => {
    expect(
      resolveActiveWorkflowEntryState({
        workflowEntryState: createEntryState(),
        selectedWorkflowPath: "/tmp/project/draft-flow.chain",
        workflowName: "Draft flow",
      }),
    ).toBeNull()
  })
})

describe("hasWorkflowReviewHistory", () => {
  it("treats an explicitly selected past run as reviewable history", () => {
    expect(
      hasWorkflowReviewHistory({
        workflowPastRunsCount: 0,
        hasSelectedPastRun: true,
      }),
    ).toBe(true)
  })

  it("returns false when the flow has neither history nor a selected run", () => {
    expect(
      hasWorkflowReviewHistory({
        workflowPastRunsCount: 0,
        hasSelectedPastRun: false,
      }),
    ).toBe(false)
  })
})
