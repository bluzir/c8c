// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ResultTab } from "./ResultTab"

function createBaseProps(): Parameters<typeof ResultTab>[0] {
  return {
    nodeStates: {},
    evalResults: {},
    runStatus: "done",
    runOutcome: "completed",
    reviewingRunHistory: false,
    selectedReviewRun: null,
    selectedResultPresentation: {
      kind: "Result",
      group: "Delivery",
      title: "Final result",
      outcomeLabel: "Produces",
      outcomeText: "Latest result",
      artifactLabel: "Final report",
      artifactRoleLabel: "Final",
    },
    selectedResultBranchLabel: null,
    selectedStagePresentation: {
      kind: "Role",
      group: "Delivery",
      title: "Draft",
      outcomeLabel: "Produces",
      outcomeText: "Draft output",
      artifactLabel: "Draft",
      artifactRoleLabel: "Working",
    },
    selectedStageIndex: 1,
    workflowStepCount: 3,
    completedStageCount: 2,
    failedStageCount: 0,
    isDisplayedResultEmpty: false,
    executionLoopSummary: null,
    savedRunLoadingNotice: null,
    savedRunErrorNotice: null,
    hasMultipleResultOptions: false,
    resultNodeOptions: [],
    selectedResultNodeId: "result-1",
    onSelectResultNode: vi.fn(),
    showArtifactContinuation: false,
    artifactContinuationToneClass: "",
    artifactPersistenceStatus: "idle",
    artifactPersistenceError: null,
    artifactRecords: [],
    nextStageRequiresApproval: false,
    nextStageAutoRuns: false,
    nextStageLabel: null,
    nextStageDescription: null,
    nextStageOutput: null,
    nextStagePending: false,
    onRunNextStage: null,
    visibleArtifactContinuation: [],
    hiddenArtifactContinuationCount: 0,
    visibleNextStageArtifacts: [],
    hiddenNextStageArtifactCount: 0,
    primaryModifierLabel: "",
    displayedResultContent: "Final answer",
    canStartFreshRun: true,
    onStartNewRun: vi.fn(),
    canRerunSelectedStage: false,
    onRerunSelectedStage: null,
    onViewActivity: vi.fn(),
    onInspectFailure: vi.fn(),
    onEditFlow: vi.fn(),
    failedNodeErrors: [],
    failureCategoryLabel: null,
    failureHint: null,
    retryStepLabel: "Draft",
    canUseInNewFlow: false,
    onUseInNewFlow: null,
    onOpenArtifact: null,
    onArtifactContextMenu: null,
    onContextMenu: vi.fn(),
  }
}

describe("ResultTab", () => {
  it("renders a document verdict for completed runs", () => {
    const props = createBaseProps()
    props.nodeStates = {
      "result-1": {
        status: "completed",
        attempts: 1,
        log: [],
        output: {
          content: "# Heading\n\nFinal answer",
          metadata: {
            source: "output",
            reason: "Ready for review",
          },
        },
      },
    }

    render(<ResultTab {...props} />)

    expect(
      screen.getByRole("heading", { name: "Ready for review" }),
    ).toBeTruthy()
    expect(screen.getByText("Final answer")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Run again" })).toBeTruthy()
  })

  it("renders a diagnostic verdict and allows rerunning the failed step", async () => {
    const user = userEvent.setup()
    const onRerunSelectedStage = vi.fn()
    const props = createBaseProps()
    props.runStatus = "error"
    props.runOutcome = "failed"
    props.canStartFreshRun = false
    props.canRerunSelectedStage = true
    props.onRerunSelectedStage = onRerunSelectedStage
    props.displayedResultContent = "Failure details"
    props.failedNodeErrors = [["result-1", { error: "Tool crashed" }]]
    props.nodeStates = {
      "result-1": {
        status: "failed",
        attempts: 1,
        log: [],
        output: {
          content: "Failure details",
          metadata: {
            source: "output",
            diagnostic_summary: {
              headline: "Needs fixes",
              summary: "The run failed before it could finish.",
              tone: "danger",
            },
          },
        },
      },
    }

    render(<ResultTab {...props} />)

    expect(screen.getByRole("heading", { name: "Needs fixes" })).toBeTruthy()
    const retryButton = screen.getByRole("button", { name: "Retry from Draft" })
    expect(retryButton).toBeTruthy()

    await user.click(retryButton)
    expect(onRerunSelectedStage).toHaveBeenCalledTimes(1)
  })
})
