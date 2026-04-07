// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { makeCompleteContent } from "@/test-utils"

// Mock child components to isolate FlowCompleteMessage
vi.mock("./FlowVerdictCard", () => ({
  FlowVerdictCard: (props: Record<string, unknown>) => (
    <div data-testid="verdict-card" data-flow-name={props.flowName as string} />
  ),
  ResultChip: (props: Record<string, unknown>) => (
    <div data-testid="result-chip">{props.name as string}</div>
  ),
}))

vi.mock("./FlowFollowUpList", () => ({
  FlowFollowUpList: (props: Record<string, unknown>) => (
    <div data-testid="follow-up-list" />
  ),
}))

// Mock Jotai store atom used by FlowCompleteMessage
vi.mock("@/lib/store", async () => {
  const { atom } = await import("jotai")
  return {
    runRatingsAtom: atom<Record<string, number>>({}),
  }
})

const { FlowCompleteMessage } = await import("./FlowCompleteMessage")

afterEach(cleanup)

describe("FlowCompleteMessage", () => {
  it("renders without crashing — empty data", () => {
    render(
      <FlowCompleteMessage flowName="Test Flow" data={makeCompleteContent()} />,
    )
    expect(screen.getByTestId("verdict-card")).toBeTruthy()
  })

  it("renders without crashing — with follow-ups", () => {
    render(
      <FlowCompleteMessage
        flowName="Test Flow"
        data={makeCompleteContent({
          followUps: [
            { label: "Run deeper analysis", emoji: "🔍", source: "recommended_next" },
            { label: "Export results", emoji: "📤", source: "contextual" },
          ],
        })}
      />,
    )
    expect(screen.getByTestId("verdict-card")).toBeTruthy()
    expect(screen.getByTestId("follow-up-list")).toBeTruthy()
  })

  it("renders without crashing — with multiple artifacts showing overflow", () => {
    render(
      <FlowCompleteMessage
        flowName="Test Flow"
        data={makeCompleteContent({
          artifacts: [
            { name: "report.md", path: "/tmp/report.md", kind: "report" },
            { name: "data.csv", path: "/tmp/data.csv", kind: "data" },
            { name: "summary.md", path: "/tmp/summary.md", kind: "report" },
          ],
        })}
      />,
    )
    expect(screen.getByTestId("verdict-card")).toBeTruthy()
    // Secondary chips (all except first hero artifact)
    expect(screen.getByText("data.csv")).toBeTruthy()
    // "+1 more" overflow button for the third artifact
    expect(screen.getByText("+1 more")).toBeTruthy()
  })
})
