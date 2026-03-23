// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { WorkflowIdleStageContract } from "./WorkflowPanelInlineSections"

describe("WorkflowIdleStageContract", () => {
  it("keeps active rules collapsed on the idle stage contract surface", async () => {
    const user = userEvent.setup()

    render(
      <WorkflowIdleStageContract
        title="Change the current app"
        resultLabel="Scoped change plan"
        summary="Turn the repo context into the next concrete change."
        contextLine="From Current app map"
        provenanceLabel="Current app map"
        inputLabels={["Project context"]}
        flowRules={[
          {
            id: "rule-1",
            label: "Keep implementation anchored to the agreed scope",
            scope: "Plan",
          },
        ]}
        onPrimaryAction={vi.fn()}
        primaryActionLabel="Start Change the current app"
      />,
    )

    expect(screen.getByText("Next step")).toBeTruthy()
    expect(screen.getByText("Active rules")).toBeTruthy()
    expect(
      screen.queryByText("Keep implementation anchored to the agreed scope"),
    ).toBeNull()

    await user.click(screen.getByText("Active rules"))
    expect(
      screen.getByText("Keep implementation anchored to the agreed scope"),
    ).toBeTruthy()
  })
})
