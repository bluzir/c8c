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
          stagePath: ["Understand", "Plan", "Build", "Review"],
          stagePathLabel: "Understand -> Plan -> Build -> Review",
          firstStageLabel: "Review",
        }}
        routingPreview={{
          helpModeLabel: "Review it",
          stageLabel: "Review",
          stages: [
            { id: "shape_map", label: "Understand", state: "available" },
            { id: "plan", label: "Plan", state: "available" },
            { id: "implement", label: "Build", state: "available" },
            { id: "review", label: "Review", state: "current" },
            { id: "verify", label: "Check", state: "later" },
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
    expect(screen.getByText("Steps")).toBeTruthy()
    expect(screen.getByText("Understand")).toBeTruthy()
    expect(screen.queryByText("Stage path")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Start Review before ship" }),
    ).toBeTruthy()
  })
})
