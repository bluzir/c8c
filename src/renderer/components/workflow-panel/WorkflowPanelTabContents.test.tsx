// @vitest-environment jsdom

import { createRef } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/InputPanel", () => ({
  InputPanel: ({ label = "Input" }: { label?: string }) => <div>{label}</div>,
}))

vi.mock("@/components/workflow/ProjectResultsPanel", () => ({
  ProjectResultsPanel: () => <div>Results panel</div>,
}))

vi.mock("@/components/OutputPanel", () => ({
  OutputPanel: () => <div>Output panel</div>,
}))

import { Tabs } from "@/components/ui/tabs"
import { WorkflowListTab } from "./WorkflowPanelTabContents"

afterEach(() => {
  cleanup()
})

function createBaseProps(): Parameters<typeof WorkflowListTab>[0] {
  return {
    listScrollRegionRef: createRef<HTMLDivElement>(),
    listShellClass: "space-y-3",
    showCreateDraftSkeleton: false,
    showResumeHeader: true,
    listSurfaceIntent: "resume_ready",
    activeEntryState: {
      workflowPath: "/tmp/project/ship.chain",
      workflowName: "Ship flow",
      source: "template",
      title: "Ship flow",
      summary: "Ship the release",
      contractLabel: "Requested result",
      contractText: "Shipped release",
      inputText: "Verification report",
      outputText: "Release decision",
      readinessText: "Ready to continue",
    },
    workflowName: "Ship flow",
    readyToRun: true,
    startApprovalRequired: false,
    entryStageLabel: "Verify",
    resumeEntrySummary: {
      workLabel: "Verification",
      currentStepLabel: "Verify",
      readyBecauseText: "Ready because Verification Report is saved.",
      checksText: "No blocking checks or approvals.",
      attachText: "Verification Report",
      latestResultText: "Latest result: Verification Report.",
      continueLabel: "Continue to Verify",
      primaryArtifact: null,
    },
    blockedResumeSummary: null,
    entryNextStepLabel: "Continue to Verify.",
    stageStartInputLabels: ["Verification Report"],
    entryFlowRules: [],
    onPrimaryEntryAction: vi.fn(),
    inputPanelRef: createRef<HTMLDivElement>(),
    showProjectArtifactsPanel: false,
    combinedArtifactRecords: [],
    projectArtifactsLoading: false,
    projectArtifactsError: null,
    requiredContracts: [],
    onOpenArtifact: vi.fn(),
    showIdleStageContract: false,
    idleStageContract: null,
    showIdleInputPanel: false,
    showReviewOutputMode: false,
    showReviewOutputPanel: false,
    showLiveOutputPanel: false,
    terminalResultOwnsLayout: false,
    blockedTaskPanel: null,
    outputPanelRef: createRef<HTMLDivElement>(),
    outputPanelProps: {} as any,
  }
}

function renderListTab(props: Parameters<typeof WorkflowListTab>[0]) {
  return render(
    <Tabs value="list">
      <WorkflowListTab {...props} />
    </Tabs>,
  )
}

describe("WorkflowListTab", () => {
  it("keeps ready saved-work input behind local disclosure", async () => {
    const user = userEvent.setup()
    renderListTab(createBaseProps())

    expect(screen.getByText("Saved work · Verify")).toBeTruthy()
    expect(screen.getByText("Adjust step input")).toBeTruthy()
    expect(screen.queryByText("Step input")).toBeNull()

    await user.click(screen.getByRole("button", { name: /adjust step input/i }))
    expect(screen.getByText("Step input")).toBeTruthy()
  })

  it("shows missing input inline when resume cannot continue yet", () => {
    renderListTab({
      ...createBaseProps(),
      listSurfaceIntent: "resume_needs_input",
      readyToRun: false,
    })

    expect(
      screen.queryByRole("button", { name: /adjust step input/i }),
    ).toBeNull()
    expect(screen.getByText("Step input")).toBeTruthy()
  })

  it("keeps ready start-contract input behind local disclosure", async () => {
    const user = userEvent.setup()
    renderListTab({
      ...createBaseProps(),
      showResumeHeader: false,
      listSurfaceIntent: "start_ready",
      activeEntryState: null,
      showIdleStageContract: true,
      idleStageContract: {
        title: "Review before ship",
        resultLabel: "Review report",
        summary: "Run the first review step with the current input.",
        inputLabels: ["Current work"],
      },
      showIdleInputPanel: true,
    })

    expect(screen.getByText("Next step")).toBeTruthy()
    expect(screen.getByText("Adjust step input")).toBeTruthy()
    expect(screen.queryByText("Step input")).toBeNull()

    await user.click(screen.getByRole("button", { name: /adjust step input/i }))
    expect(screen.getByText("Step input")).toBeTruthy()
  })

  it("shows start-contract input inline when the step still needs input", () => {
    renderListTab({
      ...createBaseProps(),
      showResumeHeader: false,
      listSurfaceIntent: "start_needs_input",
      activeEntryState: null,
      readyToRun: false,
      showIdleStageContract: true,
      idleStageContract: {
        title: "Review before ship",
        resultLabel: "Review report",
        summary: "Run the first review step with the current input.",
        inputLabels: ["Current work"],
      },
      showIdleInputPanel: true,
    })

    expect(
      screen.queryByRole("button", { name: /adjust step input/i }),
    ).toBeNull()
    expect(screen.getByText("Step input")).toBeTruthy()
  })
})
