// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { WorkflowResumeHeader } from "./WorkflowPanelInlineSections"

const baseEntry = {
  workflowPath: "/tmp/project/.c8c/ship.chain",
  workflowName: "Ship flow",
  source: "template" as const,
  title: "Ship flow",
  summary: "Ship the release",
  contractLabel: "Requested result",
  contractText: "Shipped release",
  inputText: "Verification report",
  outputText: "Release decision",
  readinessText: "Ready to continue",
  routing: {
    source: "agent" as const,
    reason: "Best next step for the current result.",
  },
}

describe("WorkflowResumeHeader", () => {
  it("renders resume copy for ready saved work and keeps rules secondary", async () => {
    const user = userEvent.setup()
    const onPrimaryAction = vi.fn()

    render(
      <WorkflowResumeHeader
        entry={baseEntry}
        displayTitle="Ship flow"
        readyToRun
        startApprovalRequired={false}
        stageLabel="Check"
        resumeSummary={{
          workLabel: "Verification",
          currentStepLabel: "Check",
          readyBecauseText: "Ready because Verification Report is saved.",
          checksText: "No blocking checks or approvals.",
          attachText: "Verification Report",
          latestResultText: "Latest result: Verification Report.",
          continueLabel: "Continue to Check",
          primaryArtifact: null,
        }}
        blockedResumeSummary={null}
        nextStepLabel="Continue to Check."
        inputLabels={[]}
        flowRules={[
          {
            id: "rule-1",
            label: "Check evidence before continuing",
            scope: "Review",
          },
        ]}
        onPrimaryAction={onPrimaryAction}
        primaryActionLabel="Continue"
      />,
    )

    expect(screen.getByText("Saved work · Check")).toBeTruthy()
    expect(screen.getByText("Continue to Check.")).toBeTruthy()
    expect(
      screen.getByText("Status: No blocking checks or approvals."),
    ).toBeTruthy()
    expect(screen.getByText("Active rules")).toBeTruthy()
    expect(screen.queryByText("Check evidence before continuing")).toBeNull()
    expect(screen.queryByText(/Agent picked this start/i)).toBeNull()

    await user.click(screen.getByText("Active rules"))
    expect(screen.getByText("Check evidence before continuing")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(onPrimaryAction).toHaveBeenCalledTimes(1)
  })

  it("renders blocked resume details when a saved step is waiting on approval", () => {
    render(
      <WorkflowResumeHeader
        entry={baseEntry}
        displayTitle="Ship flow"
        readyToRun={false}
        startApprovalRequired
        stageLabel="Ship"
        resumeSummary={null}
        blockedResumeSummary={{
          workLabel: "Release",
          currentStepLabel: "Ship",
          statusText: "Approval is still required before Ship can continue.",
          reasonText: "Legal review required.",
          attachText: "Verification Report",
          latestResultText: "Previous: Verification Report",
          findings: [],
          primaryArtifact: null,
          primaryActionLabel: "Open task",
          executionLoopSummary: null,
          flowRules: [],
        }}
        nextStepLabel="Review the result."
        inputLabels={[]}
        flowRules={[]}
        onPrimaryAction={() => undefined}
        primaryActionLabel="Open task"
      />,
    )

    expect(
      screen.getByText("Approval is still required before Ship can continue."),
    ).toBeTruthy()
    expect(
      screen.getByText("Previous: Previous: Verification Report"),
    ).toBeTruthy()
    expect(screen.getByText("Status: Legal review required.")).toBeTruthy()
  })

  it("renders a secondary action for alternative starts when provided", async () => {
    const user = userEvent.setup()
    const onSecondaryAction = vi.fn()

    render(
      <WorkflowResumeHeader
        entry={baseEntry}
        displayTitle="Ship flow"
        readyToRun
        startApprovalRequired={false}
        stageLabel="Understand"
        resumeSummary={{
          workLabel: "Starting point",
          currentStepLabel: "Understand",
          readyBecauseText: "Ready to continue.",
          checksText: "No blocking checks or approvals.",
          attachText: "Requested result",
          latestResultText: null,
          continueLabel: "Continue",
          primaryArtifact: null,
        }}
        blockedResumeSummary={null}
        nextStepLabel="Continue."
        inputLabels={[]}
        flowRules={[]}
        onPrimaryAction={() => undefined}
        primaryActionLabel="Continue"
        onSecondaryAction={onSecondaryAction}
        secondaryActionLabel="Other starts"
      />,
    )

    await user.click(screen.getByRole("button", { name: "Other starts" }))
    expect(onSecondaryAction).toHaveBeenCalledTimes(1)
  })
})
