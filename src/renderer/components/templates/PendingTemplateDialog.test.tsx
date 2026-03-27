// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PendingTemplateDialog } from "./PendingTemplateDialog"

describe("PendingTemplateDialog", () => {
  it("uses a job-first title for the selected template", () => {
    render(
      <PendingTemplateDialog
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
          executionPolicy: {
            summary: "Evidence-first, repo context",
          },
          workflow: {
            version: 1,
            name: "Delivery Factory: Map Codebase",
            nodes: [],
            edges: [],
          },
        }}
        routingPreview={{
          helpModeLabel: "Do it",
          stageLabel: "Understand",
          stages: [
            { id: "shape_map", label: "Understand", state: "current" },
            { id: "plan", label: "Plan", state: "later" },
            { id: "implement", label: "Build", state: "later" },
            { id: "review", label: "Review", state: "later" },
            { id: "verify", label: "Check", state: "later" },
            { id: "ship", label: "Ship", state: "later" },
          ],
        }}
        executionSummary="Evidence-first, repo context"
        projects={["/tmp/project"]}
        targetProjectPath="/tmp/project"
        onTargetProjectPathChange={vi.fn()}
        blockerStatement=""
        actionInstruction=""
        pendingTemplateDecision="create"
        onPendingTemplateDecisionChange={vi.fn()}
        replaceOptionAvailable
        canContinue
        onClose={vi.fn()}
        onContinue={vi.fn()}
      />,
    )

    expect(screen.getByText("Start Change the current app")).toBeTruthy()
    expect(screen.getByText("Path")).toBeTruthy()
    expect(screen.getByText("Starting point")).toBeTruthy()
    expect(screen.getByText("Steps")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Execution details" }),
    ).toBeTruthy()
  })
})
