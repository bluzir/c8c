// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  RouteClarificationDialog,
  WorkflowCreatePendingTemplateDialog,
} from "./WorkflowCreateDialogs"

describe("RouteClarificationDialog", () => {
  it("shows job-route metadata for the clarification options", () => {
    render(
      <RouteClarificationDialog
        clarification={{
          kind: "job_route",
          title: "Choose the audit path",
          message: "Pick the audit path that matches your goal.",
          options: [
            {
              value: "code_audit",
              label: "Code audit",
              description: "Look for codebase risks and quality gaps.",
              templateId: "full-stack-code-audit",
            },
          ],
        }}
        jobRouteMetaByTemplateId={{
          "full-stack-code-audit": {
            helpModeLabel: "Review it",
            stageLabel: "First step: Review",
          },
        }}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText("Choose the audit path")).toBeTruthy()
    expect(screen.getByText("Review it · First step: Review")).toBeTruthy()
    expect(
      screen.getByText("Look for codebase risks and quality gaps."),
    ).toBeTruthy()
  })
})

describe("WorkflowCreatePendingTemplateDialog", () => {
  it("shows the start contract and dev spine for the pending starting point", () => {
    render(
      <WorkflowCreatePendingTemplateDialog
        pendingTemplate={{
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
          workflow: {
            version: 1,
            name: "Delivery Factory: Review Phase",
            nodes: [],
            edges: [],
          },
        }}
        pendingQuickStartLabel="Review before ship"
        targetProjectPath="/tmp/project"
        targetProjectName="project"
        pendingTemplateIntentLabel="Review it"
        pendingTemplateStartStageLabel="Review"
        pendingTemplateExecutionSummary="Evidence-first, review checks"
        pendingTemplateProcessStages={[
          { id: "shape_map", label: "Understand", state: "available" },
          { id: "plan", label: "Plan", state: "available" },
          { id: "implement", label: "Build", state: "available" },
          { id: "review", label: "Review", state: "current" },
          { id: "verify", label: "Check", state: "later" },
          { id: "ship", label: "Ship", state: "later" },
        ]}
        openingProject={false}
        templateAction={null}
        pendingPrimaryActionLabel="Start Review before ship"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
        onCustomize={vi.fn()}
        onCreate={vi.fn()}
      />,
    )

    expect(screen.getByText("Review it")).toBeTruthy()
    expect(screen.getByText("Path")).toBeTruthy()
    expect(screen.getByText("Starting point")).toBeTruthy()
    expect(screen.getAllByText("Review").length).toBeGreaterThan(0)
    expect(screen.getByText("Steps")).toBeTruthy()
    expect(screen.getByText("Understand")).toBeTruthy()
    expect(screen.getByText("Check")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Execution details" }),
    ).toBeTruthy()
    expect(screen.queryByText("Evidence-first, review checks")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Execution details" }))

    expect(screen.getByText("Evidence-first, review checks")).toBeTruthy()
  })

  it("falls back to the template job for the dialog title", () => {
    render(
      <WorkflowCreatePendingTemplateDialog
        pendingTemplate={{
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
        }}
        pendingQuickStartLabel={null}
        targetProjectPath="/tmp/project"
        targetProjectName="project"
        pendingTemplateIntentLabel="Do it"
        pendingTemplateStartStageLabel="Understand"
        pendingTemplateExecutionSummary={null}
        pendingTemplateProcessStages={null}
        openingProject={false}
        templateAction={null}
        pendingPrimaryActionLabel="Start Change the current app"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
        onCustomize={vi.fn()}
        onCreate={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("heading", { name: "Start Change the current app" }),
    ).toBeTruthy()
  })
})
