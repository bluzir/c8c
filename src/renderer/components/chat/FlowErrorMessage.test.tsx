// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FlowErrorMessage } from "./FlowErrorMessage"
import type { ErrorContent } from "@/lib/flow-chat-types"

afterEach(cleanup)

function makeErrorContent(overrides?: Partial<ErrorContent>): ErrorContent {
  return {
    variant: "error",
    tone: "danger",
    summary: "Something went wrong during execution.",
    suggestions: [],
    actions: [],
    ...overrides,
  }
}

describe("FlowErrorMessage", () => {
  it("renders error variant with summary text", () => {
    render(
      <FlowErrorMessage
        flowName="Test Flow"
        data={makeErrorContent()}
      />,
    )
    expect(screen.getByText("Test Flow")).toBeTruthy()
    expect(screen.getByText("Error")).toBeTruthy()
    expect(screen.getByText("Something went wrong during execution.")).toBeTruthy()
  })

  it("renders cancelled variant badge", () => {
    render(
      <FlowErrorMessage
        flowName="Test Flow"
        data={makeErrorContent({ variant: "cancelled", tone: "warning" })}
      />,
    )
    expect(screen.getByText("Stopped")).toBeTruthy()
  })

  it("renders suggestions list", () => {
    render(
      <FlowErrorMessage
        flowName="Test Flow"
        data={makeErrorContent({
          suggestions: ["Check your API key", "Try a different model"],
        })}
      />,
    )
    expect(screen.getByText("Check your API key")).toBeTruthy()
    expect(screen.getByText("Try a different model")).toBeTruthy()
  })

  it("renders action buttons when present", () => {
    render(
      <FlowErrorMessage
        flowName="Test Flow"
        data={makeErrorContent({
          actions: [
            {
              label: "Retry",
              variant: "primary",
              action: { type: "retry", runId: "r1", nodeId: "n1" },
            },
          ],
        })}
      />,
    )
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy()
  })

  it("renders no action buttons for cancelled variant with empty actions", () => {
    render(
      <FlowErrorMessage
        flowName="Test Flow"
        data={makeErrorContent({ variant: "cancelled", tone: "warning", actions: [] })}
      />,
    )
    // Only the flow name and badge should appear
    expect(screen.getByText("Stopped")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
