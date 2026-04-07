// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FlowRoutingMessage } from "./FlowRoutingMessage"
import type { RoutingContent } from "@/lib/flow-chat-types"

afterEach(cleanup)

function makeRoutingContent(overrides?: Partial<RoutingContent>): RoutingContent {
  return {
    steps: [
      { label: "Inspecting project", status: "running" },
      { label: "Choosing starting point", status: "pending" },
    ],
    ...overrides,
  }
}

describe("FlowRoutingMessage", () => {
  it("renders inspecting phase with step labels", () => {
    render(<FlowRoutingMessage data={makeRoutingContent()} />)
    expect(screen.getByText("Choosing the best starting point\u2026")).toBeTruthy()
    expect(screen.getByText("Inspecting project")).toBeTruthy()
    expect(screen.getByText("Choosing starting point")).toBeTruthy()
  })

  it("renders selected template when all steps are done", () => {
    render(
      <FlowRoutingMessage
        data={makeRoutingContent({
          steps: [
            { label: "Inspecting project", status: "done" },
            { label: "Choosing starting point", status: "done" },
          ],
          selectedTemplate: {
            name: "Code Review",
            description: "Review code for quality issues",
          },
        })}
      />,
    )
    expect(screen.getByText("Starting point selected")).toBeTruthy()
    expect(screen.getByText("Code Review")).toBeTruthy()
    expect(screen.getByText("Review code for quality issues")).toBeTruthy()
  })

  it("renders clarification options when present", () => {
    render(
      <FlowRoutingMessage
        data={makeRoutingContent({
          steps: [
            { label: "Inspecting project", status: "done" },
            { label: "Choosing starting point", status: "done" },
          ],
          clarification: {
            kind: "job_route",
            title: "Which type of review?",
            message: "Pick the approach that fits best:",
            options: [
              { value: "security", label: "Security audit", description: "Focus on vulnerabilities" },
              { value: "quality", label: "Quality review" },
            ],
          },
        })}
      />,
    )
    expect(screen.getByText("Which type of review?")).toBeTruthy()
    expect(screen.getByText("Security audit")).toBeTruthy()
    expect(screen.getByText("Focus on vulnerabilities")).toBeTruthy()
    expect(screen.getByText("Quality review")).toBeTruthy()
  })

  it("renders error state with error message", () => {
    render(
      <FlowRoutingMessage
        data={makeRoutingContent({
          steps: [
            { label: "Inspecting project", status: "done" },
          ],
          error: "The AI router is not available in this build.",
        })}
      />,
    )
    expect(screen.getByText("Could not start flow")).toBeTruthy()
    expect(screen.getByText("The AI router is not available in this build.")).toBeTruthy()
  })

  it("renders retry button when onRetryRouting is provided with error", () => {
    const onRetry = () => {}
    render(
      <FlowRoutingMessage
        data={makeRoutingContent({
          steps: [{ label: "Inspecting project", status: "done" }],
          error: "Router failed",
        })}
        onRetryRouting={onRetry}
      />,
    )
    expect(screen.getByText("Try again")).toBeTruthy()
  })
})
