// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DeepLinkTemplateDialog } from "./DeepLinkTemplateDialog"

describe("DeepLinkTemplateDialog", () => {
  it("uses a job-first title for deep-linked templates", () => {
    render(
      <DeepLinkTemplateDialog
        template={{
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
        }}
        open
        onOpenChange={vi.fn()}
        projects={["/tmp/project"]}
        targetProject="/tmp/project"
        onTargetProjectChange={vi.fn()}
        onCreateInProject={vi.fn()}
        onReplaceCurrent={vi.fn()}
      />,
    )

    expect(screen.getByText("Start Review before ship")).toBeTruthy()
    expect(screen.getByText("Starts in")).toBeTruthy()
    expect(screen.getByText("Steps")).toBeTruthy()
    expect(screen.getAllByText("Review it").length).toBeGreaterThan(0)
  })
})
