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
    expect(screen.getByText("Path")).toBeTruthy()
    expect(screen.getByText("First step")).toBeTruthy()
    expect(screen.getByText("Steps")).toBeTruthy()
    expect(screen.getAllByText("Review it").length).toBeGreaterThan(0)
    expect(
      screen.getByRole("button", { name: "Execution details" }),
    ).toBeTruthy()
  })

  it("shows the source URL for remote templates", () => {
    render(
      <DeepLinkTemplateDialog
        template={{
          id: "remote-review",
          name: "Remote Review",
          description: "Review a remote template before applying it.",
          stage: "operations",
          emoji: "R",
          headline: "Review remote template",
          how: "Check the source and then decide how to apply it.",
          input: "Current work",
          output: "Review report",
          steps: [],
          source: "user",
          templatePath:
            "https://raw.githubusercontent.com/c8c-app/templates/main/remote-review.yaml",
          workflow: {
            version: 1,
            name: "Remote Review",
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

    expect(screen.getAllByText("Remote template").length).toBeGreaterThan(0)
    expect(screen.getByText("Source URL")).toBeTruthy()
    expect(
      screen.getByText(
        "https://raw.githubusercontent.com/c8c-app/templates/main/remote-review.yaml",
      ),
    ).toBeTruthy()
    expect(
      screen.getByText("Review the remote source before continuing."),
    ).toBeTruthy()
  })
})
