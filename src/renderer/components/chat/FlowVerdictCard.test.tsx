// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { makeCompleteContent } from "@/test-utils"

// Mock ContentDocViewer (uses Radix Dialog which needs DOM portals)
vi.mock("@/components/ui/content-doc-viewer", () => ({
  ContentDocViewer: () => null,
  ContentDocViewerHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const { FlowVerdictCard } = await import("./FlowVerdictCard")

const baseProps = {
  flowName: "Test Flow",
  rating: 0,
  onRate: () => {},
  onRunAgain: () => {},
}

afterEach(cleanup)

describe("FlowVerdictCard", () => {
  it("renders without crashing — no artifacts, no hero content", () => {
    render(<FlowVerdictCard data={makeCompleteContent()} {...baseProps} />)
    expect(screen.getByText("Flow complete")).toBeTruthy()
    expect(screen.getByText("Flow completed successfully.")).toBeTruthy()
  })

  it("renders without crashing — with artifacts", () => {
    render(
      <FlowVerdictCard
        data={makeCompleteContent({
          artifacts: [{ name: "report.md", path: "/tmp/report.md", kind: "report" }],
        })}
        {...baseProps}
      />,
    )
    expect(screen.getByText("report.md")).toBeTruthy()
  })

  it("renders without crashing — heroContent without artifacts", () => {
    render(
      <FlowVerdictCard
        data={makeCompleteContent({
          heroArtifactContent: "# Report\nSome content here",
        })}
        {...baseProps}
      />,
    )
    // Headline should be "Flow complete" since no artifact name
    expect(screen.getByText("Flow complete")).toBeTruthy()
    // Hero content preview should render
    expect(screen.getByText("Show full result")).toBeTruthy()
  })

  it("renders without crashing — heroContent WITH artifacts", () => {
    render(
      <FlowVerdictCard
        data={makeCompleteContent({
          artifacts: [{ name: "report.md", path: "/tmp/report.md", kind: "report" }],
          heroArtifactContent: "# Full report content",
        })}
        {...baseProps}
      />,
    )
    expect(screen.getByText("report.md")).toBeTruthy()
    expect(screen.getByText("Show full result")).toBeTruthy()
  })

  it("renders without crashing — warning tone with findings and limitations", () => {
    render(
      <FlowVerdictCard
        data={makeCompleteContent({
          tone: "warning",
          findings: ["Found issue A", "Found issue B"],
          limitations: ["Could not check C"],
        })}
        {...baseProps}
      />,
    )
    expect(screen.getByText("Completed with notes")).toBeTruthy()
    expect(screen.getByText("Found issue A")).toBeTruthy()
    expect(screen.getByText("Could not check C")).toBeTruthy()
  })

  it("shows step count in evidence strip", () => {
    render(
      <FlowVerdictCard
        data={makeCompleteContent({ stepCount: 3 })}
        {...baseProps}
      />,
    )
    expect(screen.getByText("3 steps")).toBeTruthy()
  })
})
