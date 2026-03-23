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

  it("keeps loop diagnostics behind disclosure on quality loops", async () => {
    const user = userEvent.setup()
    const props = createBaseProps()
    props.showArtifactContinuation = true
    props.executionLoopSummary = {
      loopLabel: "Review loop",
      title: "UI polish gate",
      evaluatorNodeId: "eval-1",
      criteriaText: "Check UI polish",
      outcome: "auto-return",
      outcomeLabel: "Return for fixes",
      score: 6,
      threshold: 8,
      attempt: 2,
      maxAttempts: 3,
      failedCriteriaCount: 2,
      deltaLabel: "-2 vs bar",
      reason: "Accessibility and spacing are still below the bar.",
      fixInstructions: "Tighten spacing and fix contrast before the next pass.",
      outcomeSentence:
        "Score 6/10 stayed below 8/10. Automatic return will retry this loop.",
      criteriaBreakdown: [
        { id: "contrast", score: 5 },
        { id: "spacing", score: 6 },
      ],
    }

    render(<ResultTab {...props} />)

    // Loop summary is visible in the top-level disclosure trigger
    expect(screen.getByText("Review loop")).toBeTruthy()
    expect(screen.getByText("UI polish gate")).toBeTruthy()

    // Inner details are hidden until the disclosure is opened
    expect(screen.queryByText("Active rules")).toBeNull()
    expect(screen.queryByText("Loop 2/3")).toBeNull()
    expect(
      screen.queryByText("Return to fix when checks stay below the threshold"),
    ).toBeNull()
    expect(screen.queryByText("Escalate after 3 loop attempts")).toBeNull()

    // Open the top-level loop disclosure
    await user.click(screen.getByText("Review loop"))

    // Now the loop card and rules disclosure are visible
    expect(screen.getByText("Active rules")).toBeTruthy()
    expect(screen.getByText("Technical details")).toBeTruthy()

    // Technical badges still hidden until inner disclosure is opened
    expect(screen.queryByText("Attempt 2/3")).toBeNull()

    await user.click(screen.getByText("Technical details"))
    expect(screen.getByText("Attempt 2/3")).toBeTruthy()

    await user.click(screen.getByText("Active rules"))
    expect(
      screen.getByText("Return to fix when checks stay below the threshold"),
    ).toBeTruthy()
    expect(screen.getByText("Escalate after 3 loop attempts")).toBeTruthy()
  })
})
