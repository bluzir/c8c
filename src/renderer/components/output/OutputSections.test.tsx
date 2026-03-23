// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/output/DebugDetailsPanel", () => ({
  DebugDetailsPanel: () => <div>Debug details</div>,
}))

vi.mock("@/components/output/LogEntryCard", () => ({
  LogEntryCard: ({ entry }: { entry: { type: string; content?: string } }) => (
    <div>{entry.content || entry.type}</div>
  ),
}))

import { LogTab, NodesTab } from "./OutputSections"

describe("OutputSections", () => {
  it("shows a human token footprint on each completed step row", () => {
    render(
      <NodesTab
        nodes={[{ id: "step-1", label: "Research", type: "skill" }]}
        nodeStates={{
          "step-1": {
            status: "completed",
            attempts: 1,
            startedAt: 10,
            completedAt: 4_010,
            log: [],
            metrics: {
              tokens_in: 1_200,
              tokens_out: 51_000,
              cost_usd: 0.42,
              latency_ms: 2_500,
            },
            warnings: [],
          },
        }}
        activeNodeId={null}
        evalResults={{}}
        canRerun={false}
        onSelectNode={() => {}}
      />,
    )

    expect(screen.getByText(/~52K tokens/)).toBeTruthy()
    expect(screen.queryByText("$0.42")).toBeNull()
  })

  it("keeps step-log token details behind disclosure", async () => {
    const user = userEvent.setup()

    render(
      <LogTab
        selectedNodeId="step-1"
        nodeStates={{
          "step-1": {
            status: "completed",
            attempts: 1,
            log: [
              {
                type: "text",
                content: "Finished the review pass.",
                timestamp: 1,
              },
            ],
            metrics: {
              tokens_in: 1_200,
              tokens_out: 51_000,
              cost_usd: 0.42,
              latency_ms: 2_500,
            },
            meta: {
              model_id: "sonnet",
              prompt_hash: "abc",
            },
            warnings: [],
          },
        }}
        evalResults={{}}
        workflowNode={null}
        runId={null}
      />,
    )

    expect(
      screen.getByRole("button", {
        name: /resource footprint · ~52K tokens/i,
      }),
    ).toBeTruthy()
    expect(screen.queryByText("1.2k input")).toBeNull()
    expect(screen.queryByText("$0.42")).toBeNull()

    await user.click(
      screen.getByRole("button", {
        name: /resource footprint · ~52K tokens/i,
      }),
    )

    expect(screen.getByText("1.2k input")).toBeTruthy()
    expect(screen.getByText("51.0k output")).toBeTruthy()
    expect(screen.getByText("2.5s")).toBeTruthy()
    expect(screen.getByText("sonnet")).toBeTruthy()
  })
})
