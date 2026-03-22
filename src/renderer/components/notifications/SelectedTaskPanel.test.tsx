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
})
