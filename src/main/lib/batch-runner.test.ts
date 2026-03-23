import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock electron
vi.mock("electron", () => ({
  BrowserWindow: class {},
}))

// Mock workflow-runner
const mockRunWorkflow = vi.fn()
const mockCancelWorkflowRun = vi.fn()
vi.mock("./workflow-runner", () => ({
  runWorkflow: (...args: unknown[]) => mockRunWorkflow(...args),
  cancelWorkflowRun: (...args: unknown[]) => mockCancelWorkflowRun(...args),
}))

import type { Workflow, WorkflowInput, BatchEvent } from "@shared/types"

const TEST_WORKFLOW: Workflow = {
  version: 1,
  name: "Test",
  defaults: { model: "sonnet" },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "skill-1",
      type: "skill",
      position: { x: 300, y: 0 },
      config: { skillRef: "test", prompt: "do it" },
    },
    { id: "output-1", type: "output", position: { x: 600, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "skill-1", type: "default" },
    { id: "e2", source: "skill-1", target: "output-1", type: "default" },
  ],
}

const APPROVAL_WORKFLOW: Workflow = {
  version: 1,
  name: "Approval",
  defaults: { model: "sonnet" },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "approval-1",
      type: "approval",
      position: { x: 300, y: 0 },
      config: {
        show_content: true,
        allow_edit: false,
        message: "Review content",
      },
    },
    { id: "output-1", type: "output", position: { x: 600, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "approval-1", type: "default" },
    { id: "e2", source: "approval-1", target: "output-1", type: "default" },
  ],
}

const HUMAN_WORKFLOW: Workflow = {
  version: 1,
  name: "Human",
  defaults: { model: "sonnet" },
  nodes: [
    { id: "input-1", type: "input", position: { x: 0, y: 0 }, config: {} },
    {
      id: "human-1",
      type: "human",
      position: { x: 300, y: 0 },
      config: {
        mode: "form",
        requestSource: "static",
        staticRequest: {
          version: 1,
          kind: "form",
          title: "Review content",
          fields: [
            { id: "reviewer", type: "text", label: "Reviewer", required: true },
          ],
        },
      },
    },
    { id: "output-1", type: "output", position: { x: 600, y: 0 }, config: {} },
  ],
  edges: [
    { id: "e1", source: "input-1", target: "human-1", type: "default" },
    { id: "e2", source: "human-1", target: "output-1", type: "default" },
  ],
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe("batch-runner", () => {
  let events: BatchEvent[]
  let mockWindow: any

  beforeEach(() => {
    vi.clearAllMocks()
    events = []
    mockWindow = {
      isDestroyed: () => false,
      webContents: {
        send: (_channel: string, event: BatchEvent) => events.push(event),
        on: vi.fn(),
      },
    }
  })

  it("runs batch with all inputs completing", async () => {
    mockRunWorkflow.mockResolvedValue({
      status: "completed",
      evalScores: {},
      totalCost: 0,
      durationMs: 50,
    })

    const { runBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = [
      { type: "text", value: "Topic A" },
      { type: "text", value: "Topic B" },
      { type: "text", value: "Topic C" },
    ]

    await runBatch("batch-1", TEST_WORKFLOW, inputs, 2, false, mockWindow)

    // Should have called runWorkflow 3 times
    expect(mockRunWorkflow).toHaveBeenCalledTimes(3)

    // Should have batch-done event
    const doneEvent = events.find((e) => e.type === "batch-done")
    expect(doneEvent).toBeDefined()
    if (doneEvent?.type === "batch-done") {
      expect(doneEvent.summary.total).toBe(3)
      expect(doneEvent.summary.processed).toBe(3)
      expect(doneEvent.summary.passed).toBe(3)
      expect(doneEvent.summary.failed).toBe(0)
      expect(doneEvent.summary.cancelled).toBe(0)
      expect(doneEvent.summary.pass_rate).toBe(1)
    }
  })

  it("stops on first failure when stopOnFailure is true", async () => {
    let callCount = 0
    mockRunWorkflow.mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new Error("first item failed")
    })

    const { runBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = [
      { type: "text", value: "Topic A" },
      { type: "text", value: "Topic B" },
      { type: "text", value: "Topic C" },
    ]

    await runBatch("batch-2", TEST_WORKFLOW, inputs, 1, true, mockWindow)

    const doneEvent = events.find((e) => e.type === "batch-done")
    expect(doneEvent).toBeDefined()
    if (doneEvent?.type === "batch-done") {
      expect(doneEvent.summary.failed).toBeGreaterThan(0)
      // With concurrency 1 and stop on failure, should stop after first failure
      expect(doneEvent.summary.total).toBe(3)
      expect(doneEvent.summary.processed).toBe(1)
      expect(doneEvent.summary.cancelled).toBe(2)
    }
  })

  it("emits progress events during execution", async () => {
    mockRunWorkflow.mockResolvedValue({
      status: "completed",
      evalScores: {},
      totalCost: 0,
      durationMs: 50,
    })

    const { runBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = [
      { type: "text", value: "A" },
      { type: "text", value: "B" },
    ]

    await runBatch("batch-3", TEST_WORKFLOW, inputs, 1, false, mockWindow)

    const progressEvents = events.filter((e) => e.type === "batch-progress")
    expect(progressEvents.length).toBeGreaterThan(0)

    const itemDoneEvents = events.filter((e) => e.type === "batch-item-done")
    expect(itemDoneEvents).toHaveLength(2)
  })

  it("respects concurrency cap and starts next item only after a slot frees", async () => {
    let active = 0
    let maxActive = 0
    const resolvers: Array<() => void> = []

    mockRunWorkflow.mockImplementation(() => {
      active += 1
      maxActive = Math.max(maxActive, active)
      return new Promise((resolve) => {
        resolvers.push(() => {
          active -= 1
          resolve({
            status: "completed",
            evalScores: {},
            totalCost: 0,
            durationMs: 25,
          })
        })
      })
    })

    const { runBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = [
      { type: "text", value: "A" },
      { type: "text", value: "B" },
      { type: "text", value: "C" },
      { type: "text", value: "D" },
    ]

    const batchPromise = runBatch(
      "batch-concurrency",
      TEST_WORKFLOW,
      inputs,
      2,
      false,
      mockWindow,
    )
    await waitFor(() => mockRunWorkflow.mock.calls.length === 2)
    expect(maxActive).toBe(2)

    resolvers.shift()?.()
    await waitFor(() => mockRunWorkflow.mock.calls.length === 3)
    expect(maxActive).toBe(2)

    resolvers.shift()?.()
    await waitFor(() => mockRunWorkflow.mock.calls.length === 4)
    expect(maxActive).toBe(2)

    while (resolvers.length > 0) {
      resolvers.shift()?.()
    }
    await batchPromise

    const doneEvent = events.find((e) => e.type === "batch-done")
    expect(doneEvent).toBeDefined()
    if (doneEvent?.type === "batch-done") {
      expect(doneEvent.summary.total).toBe(4)
      expect(doneEvent.summary.passed).toBe(4)
      expect(doneEvent.summary.failed).toBe(0)
    }
  })

  it("clamps excessive concurrency to the batch maximum", async () => {
    let active = 0
    let maxActive = 0

    mockRunWorkflow.mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return {
        status: "completed",
        evalScores: {},
        totalCost: 0,
        durationMs: 10,
      }
    })

    const { runBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = Array.from({ length: 20 }, (_, index) => ({
      type: "text",
      value: `Item ${index}`,
    }))

    await runBatch(
      "batch-clamped",
      TEST_WORKFLOW,
      inputs,
      50,
      false,
      mockWindow,
    )

    expect(maxActive).toBeLessThanOrEqual(10)
  })

  it("emits batch-error when workflow contains approval nodes", async () => {
    mockRunWorkflow.mockResolvedValue({
      status: "completed",
      evalScores: {},
      totalCost: 0,
      durationMs: 50,
    })

    const { runBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = [{ type: "text", value: "A" }]

    await runBatch(
      "batch-approval",
      APPROVAL_WORKFLOW,
      inputs,
      1,
      false,
      mockWindow,
    )

    const errorEvent = events.find((e) => e.type === "batch-error")
    expect(errorEvent).toBeDefined()
    expect(mockRunWorkflow).not.toHaveBeenCalled()
  })

  it("emits batch-error when workflow contains human review nodes", async () => {
    mockRunWorkflow.mockResolvedValue({
      status: "completed",
      evalScores: {},
      totalCost: 0,
      durationMs: 50,
    })

    const { runBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = [{ type: "text", value: "A" }]

    await runBatch("batch-human", HUMAN_WORKFLOW, inputs, 1, false, mockWindow)

    const errorEvent = events.find((e) => e.type === "batch-error")
    expect(errorEvent).toBeDefined()
    expect(mockRunWorkflow).not.toHaveBeenCalled()
  })

  it("treats undefined run result as failed item", async () => {
    mockRunWorkflow.mockResolvedValue(undefined)

    const { runBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = [{ type: "text", value: "A" }]

    await runBatch(
      "batch-undefined",
      TEST_WORKFLOW,
      inputs,
      1,
      false,
      mockWindow,
    )

    const doneEvent = events.find((e) => e.type === "batch-done")
    expect(doneEvent).toBeDefined()
    if (doneEvent?.type === "batch-done") {
      expect(doneEvent.summary.total).toBe(1)
      expect(doneEvent.summary.processed).toBe(1)
      expect(doneEvent.summary.passed).toBe(0)
      expect(doneEvent.summary.failed).toBe(1)
    }
  })

  it("emits batch-error for invalid concurrency", async () => {
    mockRunWorkflow.mockResolvedValue({
      status: "completed",
      evalScores: {},
      totalCost: 0,
      durationMs: 50,
    })

    const { runBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = [{ type: "text", value: "A" }]

    await runBatch(
      "batch-invalid-concurrency",
      TEST_WORKFLOW,
      inputs,
      0,
      false,
      mockWindow,
    )

    const errorEvent = events.find((e) => e.type === "batch-error")
    expect(errorEvent).toBeDefined()
    expect(mockRunWorkflow).not.toHaveBeenCalled()
  })

  it("cancels in-flight runs via cancelBatch", async () => {
    let resolveRun:
      | ((value: {
          status: "cancelled"
          evalScores: Record<string, number>
          totalCost: number
          durationMs: number
        }) => void)
      | null = null
    mockRunWorkflow.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve as typeof resolveRun
        }),
    )
    mockCancelWorkflowRun.mockImplementation(() => {
      resolveRun?.({
        status: "cancelled",
        evalScores: {},
        totalCost: 0,
        durationMs: 10,
      })
    })

    const { runBatch, cancelBatch } = await import("./batch-runner")
    const inputs: WorkflowInput[] = [
      { type: "text", value: "A" },
      { type: "text", value: "B" },
    ]

    const batchPromise = runBatch(
      "batch-cancel",
      TEST_WORKFLOW,
      inputs,
      1,
      false,
      mockWindow,
    )
    for (let i = 0; i < 10 && mockRunWorkflow.mock.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(cancelBatch("batch-cancel")).toBe(true)
    await batchPromise

    expect(mockCancelWorkflowRun).toHaveBeenCalled()
    const doneEvent = events.find((e) => e.type === "batch-done")
    expect(doneEvent).toBeDefined()
    if (doneEvent?.type === "batch-done") {
      expect(doneEvent.summary.total).toBe(2)
      expect(doneEvent.summary.cancelled).toBeGreaterThan(0)
    }
  })

  it("cancels only target batch when two batches run in parallel", async () => {
    const runResolvers = new Map<
      string,
      (result: {
        status: "completed" | "cancelled"
        evalScores: Record<string, number>
        totalCost: number
        durationMs: number
      }) => void
    >()

    mockRunWorkflow.mockImplementation((runId: string) => {
      return new Promise((resolve) => {
        runResolvers.set(
          runId,
          resolve as (result: {
            status: "completed" | "cancelled"
            evalScores: Record<string, number>
            totalCost: number
            durationMs: number
          }) => void,
        )
      })
    })

    mockCancelWorkflowRun.mockImplementation((runId: string) => {
      runResolvers.get(runId)?.({
        status: "cancelled",
        evalScores: {},
        totalCost: 0,
        durationMs: 5,
      })
    })

    const { runBatch, cancelBatch } = await import("./batch-runner")

    const batchAInputs: WorkflowInput[] = [
      { type: "text", value: "A-1" },
      { type: "text", value: "A-2" },
    ]
    const batchBInputs: WorkflowInput[] = [
      { type: "text", value: "B-1" },
      { type: "text", value: "B-2" },
    ]

    const runA = runBatch(
      "batch-A",
      TEST_WORKFLOW,
      batchAInputs,
      1,
      false,
      mockWindow,
    )
    const runB = runBatch(
      "batch-B",
      TEST_WORKFLOW,
      batchBInputs,
      2,
      false,
      mockWindow,
    )

    await waitFor(() => mockRunWorkflow.mock.calls.length >= 3)
    expect(cancelBatch("batch-A")).toBe(true)

    await waitFor(() => mockCancelWorkflowRun.mock.calls.length > 0)
    const cancelledRunIds = mockCancelWorkflowRun.mock.calls.map((call) =>
      String(call[0]),
    )
    expect(
      cancelledRunIds.every((runId) => runId.includes("batch-batch-A-item-")),
    ).toBe(true)

    for (const [runId, resolveRun] of runResolvers.entries()) {
      if (runId.includes("batch-batch-B-item-")) {
        resolveRun({
          status: "completed",
          evalScores: {},
          totalCost: 0,
          durationMs: 5,
        })
      }
    }

    await Promise.all([runA, runB])

    const doneEvents = events.filter((event) => event.type === "batch-done")
    const doneA = doneEvents.find(
      (event) => event.type === "batch-done" && event.batchId === "batch-A",
    )
    const doneB = doneEvents.find(
      (event) => event.type === "batch-done" && event.batchId === "batch-B",
    )

    expect(doneA).toBeDefined()
    expect(doneB).toBeDefined()
    if (doneA?.type === "batch-done") {
      expect(doneA.summary.cancelled).toBeGreaterThan(0)
    }
    if (doneB?.type === "batch-done") {
      expect(doneB.summary.failed).toBe(0)
      expect(doneB.summary.cancelled).toBe(0)
      expect(doneB.summary.passed).toBe(2)
    }
  })
})
