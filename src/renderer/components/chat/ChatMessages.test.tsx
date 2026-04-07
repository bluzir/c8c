// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { TimelineEntry } from "@/hooks/useFlowChatTimeline"

// Mock all child message components
vi.mock("./ChatMessageBubble", () => ({
  ChatMessageBubble: (props: Record<string, unknown>) => (
    <div data-testid="chat-bubble" />
  ),
}))
vi.mock("./FlowDecisionMessage", () => ({
  FlowDecisionMessage: () => <div data-testid="flow-decision" />,
}))
vi.mock("./FlowCompleteMessage", () => ({
  FlowCompleteMessage: () => <div data-testid="flow-complete" />,
}))
vi.mock("./FlowErrorMessage", () => ({
  FlowErrorMessage: () => <div data-testid="flow-error" />,
}))
vi.mock("./FlowStartMessage", () => ({
  FlowStartMessage: () => <div data-testid="flow-start" />,
}))
vi.mock("./FlowProgressMessage", () => ({
  FlowProgressMessage: () => <div data-testid="flow-progress" />,
}))
vi.mock("./FlowRoutingMessage", () => ({
  FlowRoutingMessage: () => <div data-testid="flow-routing" />,
}))
vi.mock("./StepNarrativeItem", () => ({
  StepNarrativeItem: () => <div data-testid="step-narrative" />,
}))

// Mock useFlowChatTimeline
const mockTimeline: TimelineEntry[] = []
const mockFlowMessages: unknown[] = []
const mockEntryState = null
const mockPastRunMeta = null

vi.mock("@/hooks/useFlowChatTimeline", () => ({
  useFlowChatTimeline: () => ({
    timeline: mockTimeline,
    flowMessages: mockFlowMessages,
    entryState: mockEntryState,
    pastRunMeta: mockPastRunMeta,
  }),
}))

// Mock store atoms used by ChatMessages
vi.mock("@/lib/store", async () => {
  const { atom } = await import("jotai")
  return {
    chatFlowInputRequestAtom: atom(null),
    chatRoutingProgressAtom: atom(null),
    chatScrollTopByWorkflowAtom: atom<Record<string, number>>({}),
    selectedProjectAtom: atom(null),
    selectedWorkflowPathAtom: atom<string | null>(null),
  }
})

vi.mock("@/features/execution/flow-chat-state", async () => {
  const { atom } = await import("jotai")
  return {
    resolvedDecisionIdsAtom: atom(new Set<string>()),
    resolveFlowChatDecisionAtom: atom(null, () => {}),
  }
})

vi.mock("@/features/execution/state", async () => {
  const { atom } = await import("jotai")
  return {
    workflowHistoryRunsAtom: atom([]),
  }
})

const { ChatMessages } = await import("./ChatMessages")

afterEach(() => {
  cleanup()
  mockTimeline.length = 0
  mockFlowMessages.length = 0
})

describe("ChatMessages", () => {
  it("renders without crashing — empty timeline", () => {
    const { container } = render(
      <ChatMessages messages={[]} status="idle" />,
    )
    // Container should exist but the content area is hidden when empty
    expect(container).toBeTruthy()
  })

  it("renders without crashing — chat messages only", () => {
    const now = Date.now()
    mockTimeline.push(
      {
        kind: "chat",
        message: { id: "m1", role: "user", content: "Hello", timestamp: now },
      },
      {
        kind: "chat",
        message: {
          id: "m2",
          role: "assistant",
          content: "Hi there",
          timestamp: now + 1000,
        },
      },
    )
    render(
      <ChatMessages
        messages={[
          { id: "m1", role: "user", content: "Hello", timestamp: now },
          { id: "m2", role: "assistant", content: "Hi there", timestamp: now + 1000 },
        ]}
        status="idle"
      />,
    )
    expect(screen.getAllByTestId("chat-bubble")).toHaveLength(2)
  })

  it("renders without crashing — flow complete message", () => {
    const now = Date.now()
    mockTimeline.push({
      kind: "flow",
      message: {
        id: "fc1",
        flowName: "Test Flow",
        timestamp: now,
        content: {
          type: "complete",
          data: {
            summary: "Done",
            findings: [],
            limitations: [],
            artifacts: [],
            followUps: [],
            metrics: { duration: "3s", cost: "$0.01" },
            runId: "r1",
          },
        },
      },
    })
    render(<ChatMessages messages={[]} status="idle" />)
    expect(screen.getByTestId("flow-complete")).toBeTruthy()
  })

  it("renders without crashing — full flow sequence (routing + start + progress + complete)", () => {
    const now = Date.now()
    mockTimeline.push(
      {
        kind: "flow",
        message: {
          id: "fr1",
          flowName: "Test",
          timestamp: now,
          content: {
            type: "routing",
            data: { steps: [{ label: "Read goal", status: "done" }] },
          },
        },
      },
      {
        kind: "flow",
        message: {
          id: "fs1",
          flowName: "Test",
          timestamp: now + 1000,
          content: {
            type: "start",
            data: { description: "Starting flow" },
          },
        },
      },
      {
        kind: "flow",
        message: {
          id: "fp1",
          flowName: "Test",
          timestamp: now + 2000,
          content: {
            type: "progress",
            data: { steps: [{ nodeId: "s1", label: "Research", status: "running" }] },
          },
        },
      },
      {
        kind: "flow",
        message: {
          id: "fc1",
          flowName: "Test",
          timestamp: now + 3000,
          content: {
            type: "complete",
            data: {
              summary: "Done",
              findings: [],
              limitations: [],
              artifacts: [],
              followUps: [],
              metrics: { duration: "3s", cost: "$0.01" },
              runId: "r1",
            },
          },
        },
      },
    )
    render(<ChatMessages messages={[]} status="idle" />)
    expect(screen.getByTestId("flow-routing")).toBeTruthy()
    expect(screen.getByTestId("flow-start")).toBeTruthy()
    expect(screen.getByTestId("flow-progress")).toBeTruthy()
    expect(screen.getByTestId("flow-complete")).toBeTruthy()
  })

  it("renders without crashing — step-narrative messages", () => {
    const now = Date.now()
    mockTimeline.push({
      kind: "flow",
      message: {
        id: "sn1",
        flowName: "Test",
        timestamp: now,
        content: {
          type: "step-narrative",
          data: {
            nodeId: "s1",
            label: "Research",
            status: "done",
            nodeType: "skill",
          },
        },
      },
    })
    render(<ChatMessages messages={[]} status="idle" />)
    expect(screen.getByTestId("step-narrative")).toBeTruthy()
  })
})
