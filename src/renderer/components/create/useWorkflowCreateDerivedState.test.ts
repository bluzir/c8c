import { describe, expect, it } from "vitest"

import { resolveWorkflowCreateFigureOwner } from "./useWorkflowCreateDerivedState"

describe("resolveWorkflowCreateFigureOwner", () => {
  it("blocks the create surface until a project is selected", () => {
    expect(
      resolveWorkflowCreateFigureOwner({
        projectRequired: true,
        submitError: "could not start",
        routingActive: true,
        continuationPresentation: "dominant",
        canSubmitPrompt: true,
        preferNewFlow: true,
      }),
    ).toBe("no_project")
  })

  it("keeps dominant continuation visible before a new request starts", () => {
    expect(
      resolveWorkflowCreateFigureOwner({
        projectRequired: false,
        submitError: null,
        routingActive: false,
        continuationPresentation: "dominant",
        canSubmitPrompt: false,
        preferNewFlow: false,
      }),
    ).toBe("continue_first")
  })

  it("switches to the composer once the user starts a new request", () => {
    expect(
      resolveWorkflowCreateFigureOwner({
        projectRequired: false,
        submitError: null,
        routingActive: false,
        continuationPresentation: "supporting",
        canSubmitPrompt: true,
        preferNewFlow: false,
      }),
    ).toBe("new_flow")
  })

  it("falls back to browse suggestions when nothing else owns the figure", () => {
    expect(
      resolveWorkflowCreateFigureOwner({
        projectRequired: false,
        submitError: null,
        routingActive: false,
        continuationPresentation: "supporting",
        canSubmitPrompt: false,
        preferNewFlow: false,
      }),
    ).toBe("browse_for_start")
  })
})
