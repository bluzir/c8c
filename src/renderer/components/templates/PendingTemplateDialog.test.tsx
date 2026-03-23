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
          workflow: {
            version: 1,
            name: "Delivery Factory: Map Codebase",
            nodes: [],
            edges: [],
          },
        }}
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
  })
})
