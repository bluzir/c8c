// @vitest-environment jsdom

import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { HumanTaskField, HumanTaskSnapshot } from "@shared/types"
import { SelectedTaskPanel } from "./SelectedTaskPanel"

function createSelectedTask(): HumanTaskSnapshot {
  return {
    task: "Release approval",
    taskId: "task-1",
    kind: "approval",
    status: "open",
    workspace: "/tmp/project/.c8c/runs/run-1",
    chainId: "chain-1",
    sourceRunId: "run-1",
    nodeId: "approval-1",
    workflowName: "Ship flow",
    workflowPath: "/tmp/project/.c8c/ship.chain",
    projectPath: "/tmp/project",
    title: "Release approval",
    summary: "Confirm the release can continue.",
    createdAt: 1,
    updatedAt: 2,
    responseRevision: 0,
    request: {
      version: 1,
      kind: "approval",
      title: "Release approval",
      fields: [
        {
          id: "notes",
          type: "textarea",
          label: "Notes",
          required: true,
          placeholder: "Add approval notes",
        },
      ],
    },
    latestResponse: null,
  }
}

function ControlledSelectedTaskPanel({
  selectedTask,
  onSubmitAndContinue,
  onReject,
}: {
  selectedTask: HumanTaskSnapshot
  onSubmitAndContinue: () => void
  onReject: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({})

  return (
    <SelectedTaskPanel
      selectedTask={selectedTask}
      taskLoading={false}
      taskSubmitting={false}
      taskAnswers={answers}
      selectedTaskStageMeta={{ title: "Ship", group: "Release" }}
      onFieldChange={(field: HumanTaskField, value: unknown) => {
        setAnswers((previous) => ({ ...previous, [field.id]: value }))
      }}
      onSubmit={vi.fn()}
      onSubmitAndContinue={onSubmitAndContinue}
      onReject={onReject}
    />
  )
}

describe("SelectedTaskPanel", () => {
  it("requires answers before approving and continuing a blocked approval flow", async () => {
    const user = userEvent.setup()
    const onSubmitAndContinue = vi.fn()
    const onReject = vi.fn()

    render(
      <ControlledSelectedTaskPanel
        selectedTask={createSelectedTask()}
        onSubmitAndContinue={onSubmitAndContinue}
        onReject={onReject}
      />,
    )

    const approveButton = screen.getByRole("button", {
      name: "Approve & Continue",
    })
    expect((approveButton as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("Complete required fields: Notes.")).toBeTruthy()

    await user.type(
      screen.getByPlaceholderText("Add approval notes"),
      "Approved after final QA.",
    )
    expect((approveButton as HTMLButtonElement).disabled).toBe(false)

    await user.click(approveButton)
    await user.click(screen.getByRole("button", { name: "Reject & stop" }))

    expect(onSubmitAndContinue).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it("keeps loop diagnostics behind disclosure when blocked by a quality loop", async () => {
    const user = userEvent.setup()

    render(
      <SelectedTaskPanel
        selectedTask={createSelectedTask()}
        taskLoading={false}
        taskSubmitting={false}
        taskAnswers={{}}
        selectedTaskStageMeta={{ title: "Ship", group: "Release" }}
        blockedSummary={{
          statusText: "Approval required",
          reasonText: "Two checks are still below the bar.",
          inputText: "Verification Report",
          latestResultText: "Latest result: Verification Report.",
          findings: ["Security (5/8)", "Regressions (6/8)"],
          executionLoopSummary: {
            loopLabel: "Review loop",
            title: "Ship review gate",
            evaluatorNodeId: "eval-1",
            criteriaText: "Ship review criteria",
            outcome: "human decision",
            outcomeLabel: "Decision required",
            score: 6,
            threshold: 8,
            attempt: 2,
            maxAttempts: 3,
            failedCriteriaCount: 2,
            deltaLabel: "-2 vs bar",
            reason: "Two checks are still below the bar.",
            fixInstructions: "Decide whether to fix or hold the release.",
            outcomeSentence:
              "Score 6/10 stayed below 8/10. Approval is required.",
            criteriaBreakdown: [
              { id: "Security", score: 5 },
              { id: "Regressions", score: 6 },
            ],
          },
          flowRules: [
            {
              id: "loop-return",
              label: "Return to fix when checks stay below the threshold",
              scope: "Review",
            },
            {
              id: "loop-approval",
              label: "Ask for human approval when the loop cannot decide",
              scope: "Review",
            },
          ],
        }}
        onFieldChange={vi.fn()}
        onSubmit={vi.fn()}
        onSubmitAndContinue={vi.fn()}
        onReject={vi.fn()}
      />,
    )

    expect(screen.getByText("Decision details")).toBeTruthy()
    expect(screen.queryByText("Review loop")).toBeNull()
    expect(screen.queryByText("Active rules")).toBeNull()
    expect(screen.queryByText("Loop 2/3")).toBeNull()
    expect(
      screen.queryByText("Ask for human approval when the loop cannot decide"),
    ).toBeNull()

    await user.click(screen.getByText("Decision details"))
    expect(screen.getAllByText("Review loop").length).toBeGreaterThan(0)
    expect(screen.getByText("Active rules")).toBeTruthy()

    await user.click(screen.getByText("Technical details"))
    expect(screen.getByText("Attempt 2/3")).toBeTruthy()

    expect(
      screen.getByText("Ask for human approval when the loop cannot decide"),
    ).toBeTruthy()
  })
})
