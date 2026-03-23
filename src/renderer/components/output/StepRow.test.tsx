// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { StepRow } from "./StepRow"

describe("StepRow", () => {
  it("renders name and duration", () => {
    render(
      <StepRow
        name="Research competitors"
        status="done"
        duration="4m 54s"
        expanded={false}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByText("Research competitors")).toBeTruthy()
    expect(screen.getByText("4m 54s")).toBeTruthy()
  })

  it("shows running indicator for running status", () => {
    render(
      <StepRow
        name="Drafting report"
        status="running"
        expanded={false}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByTestId("step-status-beacon")).toBeTruthy()
  })

  it("calls onToggle on click", async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    render(
      <StepRow
        name="Analyze data"
        status="done"
        expanded={false}
        onToggle={onToggle}
      />,
    )

    await user.click(screen.getByLabelText("Step: Analyze data"))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it("renders fan-out progress", () => {
    render(
      <StepRow
        name="Split tasks"
        status="running"
        nodeType="splitter"
        fanOutProgress="4/10"
        expanded={false}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByText("4/10")).toBeTruthy()
  })

  it("does NOT call onToggle for pending steps", async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    const { container } = render(
      <StepRow
        name="Future step"
        status="pending"
        expanded={false}
        onToggle={onToggle}
      />,
    )

    const button = container.querySelector("button")
    if (button) {
      await user.click(button)
    }
    expect(onToggle).not.toHaveBeenCalled()
  })

  it("renders children when expanded", () => {
    render(
      <StepRow
        name="Completed step"
        status="done"
        expanded={true}
        onToggle={() => {}}
      >
        <div>Step detail content</div>
      </StepRow>,
    )

    expect(screen.getByText("Step detail content")).toBeTruthy()
  })

  it("renders cost when provided", () => {
    render(
      <StepRow
        name="Expensive step"
        status="done"
        duration="2m 10s"
        cost="$0.42"
        expanded={false}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByText(/\$0\.42/)).toBeTruthy()
  })

  it("shows correct status icon for failed status", () => {
    render(
      <StepRow
        name="Broken step"
        status="failed"
        expanded={false}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByTestId("step-status-failed")).toBeTruthy()
  })

  it("shows correct status icon for blocked status", () => {
    render(
      <StepRow
        name="Blocked step"
        status="blocked"
        expanded={false}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByTestId("step-status-blocked")).toBeTruthy()
  })
})
