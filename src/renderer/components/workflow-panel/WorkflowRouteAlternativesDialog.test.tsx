// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { TelemetryUiEvent } from "@shared/types"
import { WorkflowRouteAlternativesDialog } from "./WorkflowRouteAlternativesDialog"

beforeAll(() => {
  const testWindow = window as Window & {
    api: Window["api"] & {
      trackUiEvent?: (eventName: TelemetryUiEvent) => Promise<boolean>
    }
  }
  if (!testWindow.api) {
    testWindow.api = {} as Window["api"]
  }
  testWindow.api.trackUiEvent = vi.fn(() => Promise.resolve(true))
})

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
    expect(screen.getByText("Plan it · Starting point: Plan")).toBeTruthy()

    await user.click(
      screen.getByRole("button", {
        name: "Plan the change Plan it · Starting point: Plan",
      }),
    )
    expect(onSelect).toHaveBeenCalledWith("delivery-plan-phase")
  })
})
