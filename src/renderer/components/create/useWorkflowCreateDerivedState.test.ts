import { describe, expect, it } from "vitest"

import {
  formatPendingStartActionLabel,
  formatStartingPointMeta,
  resolveWorkflowCreateFigureOwner,
} from "./useWorkflowCreateDerivedState"

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

  it("formats job-first secondary metadata for suggested starts", () => {
    expect(
      formatStartingPointMeta({
        helpModeLabel: "Review it",
        stageLabel: "Review",
      }),
    ).toBe("Review it · First step: Review")

    expect(
      formatStartingPointMeta({
        helpModeLabel: null,
        stageLabel: "Understand",
      }),
    ).toBe("First step: Understand")

    expect(
      formatStartingPointMeta({
        helpModeLabel: null,
        stageLabel: null,
        fallbackGuidedLabel: "Guided starting point",
      }),
    ).toBe("Guided starting point")
  })

  it("formats pending start actions from the chosen starting point", () => {
    expect(
      formatPendingStartActionLabel({
        quickStartLabel: "Review before ship",
      }),
    ).toBe("Start Review before ship")

    expect(
      formatPendingStartActionLabel({
        pendingTemplate: {
          id: "delivery-map-codebase",
          name: "Delivery Factory: Map Codebase",
          description: "Map the current codebase.",
          stage: "research",
          emoji: "M",
          headline: "Understand the current app",
          how: "Inspect the repo before changing it.",
          input: "Project path",
          output: "Codebase map",
          steps: [],
          workflow: {
            version: 1,
            name: "Delivery Factory: Map Codebase",
            nodes: [],
            edges: [],
          },
        },
      }),
    ).toBe("Start Change the current app")

    expect(formatPendingStartActionLabel({})).toBe("Start this starting point")
  })
})
