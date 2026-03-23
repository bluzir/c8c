// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { StageStartApprovalDialog } from "./WorkflowPanelInlineSections"

describe("StageStartApprovalDialog", () => {
  it("keeps flow rules and notes behind decision details", async () => {
    const user = userEvent.setup()

    render(
      <StageStartApprovalDialog
        open
        flowName="Ship flow"
        title="Verify completion"
        stageLabel="Verify"
        stepDescription="Run the final verification step with the current input."
        flowRules={[
          {
            id: "rule-1",
            label: "Check evidence before continuing",
            scope: "Verify",
          },
        ]}
        expectedArtifact="Verification result"
        inputPreview="Use the current verification report."
        inputLabels={["Verification report"]}
        notes={["This step may open browser-based verification checks."]}
        shortcutLabel="Cmd+Enter"
        approveConsequence="Runs this step with the current input."
        rejectConsequence="Keeps the flow in edit mode."
        primaryModifierKey="meta"
        onApprove={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("Decision details")).toBeTruthy()
    expect(screen.getByText("What will run")).toBeTruthy()
    expect(screen.queryByText("Approval notes")).toBeNull()
    expect(screen.queryByText("Active rules")).toBeNull()
    expect(screen.queryByText("Verification report")).toBeNull()
    expect(
      screen.queryByText("Use the current verification report."),
    ).toBeNull()

    await user.click(screen.getByText("What will run"))

    expect(screen.getByText("Verification report")).toBeTruthy()
    expect(
      screen.getByText("Use the current verification report."),
    ).toBeTruthy()

    await user.click(screen.getByText("Decision details"))

    expect(screen.getByText("Approval notes")).toBeTruthy()
    expect(screen.getByText("Active rules")).toBeTruthy()
    expect(
      screen.getByText("This step may open browser-based verification checks."),
    ).toBeTruthy()
  })
})
