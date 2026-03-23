// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { WorkflowIdleStageContract } from "./WorkflowPanelInlineSections"

describe("WorkflowIdleStageContract", () => {
  it("shows active rules on the idle stage contract surface", () => {
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

    expect(screen.getByText("Stage contract")).toBeTruthy()
    expect(screen.getByText("Active rules")).toBeTruthy()
    expect(
      screen.getByText("Keep implementation anchored to the agreed scope"),
    ).toBeTruthy()
  })
})
