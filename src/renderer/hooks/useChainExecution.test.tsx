// @vitest-environment jsdom

import { Provider, createStore } from "jotai"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  useChainExecution,
  type ChainExecutionState,
} from "./useChainExecution"

function Probe({ onReady }: { onReady: (value: ChainExecutionState) => void }) {
  const execution = useChainExecution()
  onReady(execution)
  return <div>{execution.hasExecutionProvider ? "provider" : "read-only"}</div>
}

describe("useChainExecution", () => {
  it("falls back to read-only execution state when ExecutionProvider is missing", async () => {
    const store = createStore()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const onReady = vi.fn<(value: ChainExecutionState) => void>()

    render(
      <Provider store={store}>
        <Probe onReady={onReady} />
      </Provider>,
    )

    expect(screen.queryByText("read-only")).toBeTruthy()
    const execution = onReady.mock.calls[0]?.[0]
    expect(execution).toBeTruthy()
    if (!execution) {
      throw new Error("Expected useChainExecution snapshot")
    }
    expect(execution.hasExecutionProvider).toBe(false)

    await execution.run()
    await execution.cancel()
    await expect(
      execution.continueWithWorkflow(
        {
          runId: "run-1",
          status: "completed",
          workflowName: "Flow",
          startedAt: 1,
          completedAt: 2,
          reportPath: "",
          workspace: "/tmp/run-1",
          totalCost: 0,
          totalTokensIn: 0,
          totalTokensOut: 0,
          evalScores: {},
          durationMs: 1,
        },
        {
          version: 1,
          name: "Flow",
          nodes: [],
          edges: [],
        },
        null,
      ),
    ).resolves.toBe(false)
    expect(consoleError).toHaveBeenCalledTimes(1)
  })
})
