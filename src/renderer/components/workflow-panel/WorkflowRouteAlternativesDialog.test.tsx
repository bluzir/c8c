// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { WorkflowRouteAlternativesDialog } from "./WorkflowRouteAlternativesDialog"

describe("WorkflowRouteAlternativesDialog", () => {
  it("shows alternate routed starts and forwards selection", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <WorkflowRouteAlternativesDialog
        open
        options={[
          {
            templateId: "delivery-plan-phase",
            title: "Plan the change",
            helpModeLabel: "Plan it",
            stageLabel: "Plan",
          },
        ]}
        pendingTemplateId={null}
        onOpenChange={() => undefined}
        onSelect={onSelect}
      />,
    )

    expect(screen.getByText("Other starts")).toBeTruthy()
    expect(screen.getByText("Plan it · First step: Plan")).toBeTruthy()

    await user.click(
      screen.getByRole("button", {
        name: "Plan the change Plan it · First step: Plan",
      }),
    )
    expect(onSelect).toHaveBeenCalledWith("delivery-plan-phase")
  })
})
