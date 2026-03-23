// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TemplateDetailPanel } from "./TemplateDetailPanel"

describe("TemplateDetailPanel", () => {
  it("shows the start contract and dev spine for development starting points", () => {
    render(
      <TemplateDetailPanel
        entry={{
          template: {
            id: "delivery-review-phase",
            name: "Delivery Factory: Review Phase",
            description: "Review the current work before ship.",
            stage: "operations",
            emoji: "R",
            headline: "Review before ship",
            how: "Surface concrete gaps before final checks.",
            input: "Current work",
            output: "Review report",
            steps: [],
            executionPolicy: {
              summary: "Evidence-first, review checks",
            },
            workflow: {
              version: 1,
              name: "Delivery Factory: Review Phase",
              nodes: [],
              edges: [],
            },
          },
          entryKind: "guided",
          jobLabel: "Review before ship",
          jobSummary: "Check the current work before verification.",
          primaryActionLabel: "Start Review before ship",
          useWhen: "The work needs a final review before shipping.",
          youProvide: "Current work",
          youGetFirst: "Review report",
          stagePath: ["Shape / Map", "Plan", "Implement", "Review"],
          stagePathLabel: "Shape / Map -> Plan -> Implement -> Review",
          firstStageLabel: "Review",
        }}
        routingPreview={{
          helpModeLabel: "Review it",
          stageLabel: "Review",
          stages: [
            { id: "shape_map", label: "Shape / Map", state: "available" },
            { id: "plan", label: "Plan", state: "available" },
            { id: "implement", label: "Implement", state: "available" },
            { id: "review", label: "Review", state: "current" },
            { id: "verify", label: "Verify", state: "later" },
            { id: "ship", label: "Ship", state: "later" },
          ],
        }}
        onUse={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText("Intent")).toBeTruthy()
    expect(screen.getAllByText("Review it").length).toBeGreaterThan(0)
    expect(screen.getByText("Starts in")).toBeTruthy()
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0)
    expect(screen.getByText("Dev Process")).toBeTruthy()
    expect(screen.getByText("Shape / Map")).toBeTruthy()
    expect(screen.queryByText("Stage path")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Start Review before ship" }),
    ).toBeTruthy()
  })
})
